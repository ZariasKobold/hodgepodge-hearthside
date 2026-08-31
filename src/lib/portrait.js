/**
 * Leader portraits — upload, circular crop, and the size budget that keeps a
 * campaign syncable.
 *
 * A portrait is stored as a WebP data URL on `leader.portrait`, inside the
 * campaign doc. That choice is deliberate and it is the cheap one:
 *
 *   - It rides the existing machinery. localStorage is the working copy, D1
 *     mirrors the doc, and the JSON export is the escape hatch §8 requires.
 *     An image in the doc needs no bucket, no signed URLs, no second auth
 *     path, and it survives this app disappearing.
 *   - It cannot leak. There is no public asset URL to guess.
 *
 * The cost is that every byte here is a byte in localStorage, in every sync
 * push, and in the export. So the budget below is not tidiness — it is the
 * thing that stops a photo from breaking somebody's campaign.
 *
 * **D1 caps a row at roughly 1 MB.** The doc column holds the whole campaign,
 * so an unbounded portrait would not fail at upload; it would fail later, at
 * sync, on a device the player is not looking at. `MAX_STORED_BYTES` is set
 * far enough below that ceiling for the rest of a twelve-week campaign to fit
 * beside it with room to spare.
 *
 * The stored image is SQUARE, and the circle is applied in CSS at every call
 * site. Baking transparent corners would cost bytes, lock the shape, and make
 * the same asset useless anywhere that is not a circle. What the cropper shows
 * inside its circular mask is exactly what is stored inside that square.
 *
 * Everything above `renderPortrait` is pure and tested. `renderPortrait` and
 * `loadImage` touch the DOM — the same licence `storage.js` takes — and are
 * exercised by using the app rather than by unit tests.
 */

/** Output edge, in pixels. 256 covers a 96px avatar at 2.5x and crops small. */
export const PORTRAIT_PX = 256

/** What a file picker is allowed to hand us. */
export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]

/**
 * Refused before decoding. A 40-megapixel phone photo will decode to hundreds
 * of megabytes of bitmap and can hang a mobile browser outright, so the guard
 * has to come before `createImageBitmap`, not after.
 */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024

/** The stored budget. See the D1 note above — this is the load-bearing number. */
export const MAX_STORED_BYTES = 120 * 1024

/**
 * Tried in order until one fits the budget. Dropping quality is preferred to
 * dropping dimensions: at 256px a soft photo still reads, whereas a 128px one
 * looks broken next to the hand-drawn art it sits beside.
 */
export const QUALITY_LADDER = [0.82, 0.72, 0.62, 0.5, 0.4]

/** Beyond this the player is cropping single pixels and it only ever looks bad. */
export const MAX_ZOOM = 8

export function validateSource(file) {
  if (!file) return { ok: false, error: 'No file chosen.' }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, error: 'That has to be a PNG, JPEG, WebP, GIF or AVIF image.' }
  }
  if (file.size > MAX_SOURCE_BYTES) {
    const mb = (file.size / 1048576).toFixed(1)
    const cap = Math.round(MAX_SOURCE_BYTES / 1048576)
    return { ok: false, error: `That image is ${mb} MB. The limit is ${cap} MB.` }
  }
  return { ok: true, error: null }
}

/**
 * The smallest scale at which the image still covers the frame completely.
 *
 * Below this a corner of the crop would be empty, and an empty corner inside a
 * circular mask reads as a rendering bug rather than as a choice.
 */
export function coverScale(imgW, imgH, frame) {
  if (!imgW || !imgH || !frame) return 1
  return Math.max(frame / imgW, frame / imgH)
}

export function clampScale(scale, imgW, imgH, frame) {
  const min = coverScale(imgW, imgH, frame)
  const max = min * MAX_ZOOM
  if (!Number.isFinite(scale)) return min
  return Math.min(max, Math.max(min, scale))
}

/**
 * Keeps the displayed image covering the frame.
 *
 * Offsets are the image's top-left corner relative to the frame's, so they run
 * from negative (panned up/left) to zero. Clamping here rather than in the drag
 * handler means a zoom-out can never strand the image off-centre.
 */
export function clampOffset(offset, imgW, imgH, scale, frame) {
  const w = imgW * scale
  const h = imgH * scale
  const minX = Math.min(0, frame - w)
  const minY = Math.min(0, frame - h)
  const x = Math.min(0, Math.max(minX, offset?.x ?? 0))
  const y = Math.min(0, Math.max(minY, offset?.y ?? 0))
  return { x, y }
}

/** Centres the image in the frame at the given scale. */
export function centredOffset(imgW, imgH, scale, frame) {
  return clampOffset(
    { x: (frame - imgW * scale) / 2, y: (frame - imgH * scale) / 2 },
    imgW, imgH, scale, frame
  )
}

/**
 * Translates frame-space pan/zoom into the source rectangle `drawImage` wants.
 *
 * Clamped against the image bounds because a fractional scale can put
 * `sx + sWidth` a hair past the edge, and canvas answers that by stretching the
 * last column of pixels rather than by erroring.
 */
export function sourceRect({ imgW, imgH, scale, offset, frame }) {
  const s = scale || 1
  const size = Math.min(frame / s, imgW, imgH)
  const rawX = -(offset?.x ?? 0) / s
  const rawY = -(offset?.y ?? 0) / s
  return {
    sx: Math.max(0, Math.min(rawX, imgW - size)),
    sy: Math.max(0, Math.min(rawY, imgH - size)),
    sWidth: size,
    sHeight: size,
  }
}

/** Decoded byte length of a data URL, without allocating the bytes. */
export function dataUrlBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return 0
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const b64 = dataUrl.slice(comma + 1)
  if (!b64) return 0
  let padding = 0
  if (b64.endsWith('==')) padding = 2
  else if (b64.endsWith('=')) padding = 1
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding)
}

export function fitsBudget(dataUrl, max = MAX_STORED_BYTES) {
  return dataUrlBytes(dataUrl) <= max
}

/* ── the DOM half ────────────────────────────────────────────────── */

/**
 * Decodes a File into something canvas can draw.
 *
 * The object URL deliberately outlives this call, and the caller owns it. An
 * earlier version revoked it in `onload`, which worked for the canvas — the
 * bitmap is already decoded by then — but left `img.src` pointing at a dead
 * URL, so the cropper's own preview rendered as an empty black square. Revoke
 * through `releaseImage` once the picture is no longer on screen.
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image.'))
    }
    img.src = url
  })
}

/** Frees the object URL behind an image from `loadImage`. Safe to call twice. */
export function releaseImage(image) {
  const src = image?.src
  if (typeof src === 'string' && src.startsWith('blob:')) URL.revokeObjectURL(src)
}

/**
 * Draws the chosen crop and encodes it down until it fits the budget.
 *
 * Returns `{ dataUrl, bytes, quality }`, or throws if even the bottom of the
 * ladder is too big — which should not happen at 256px, and if it ever does
 * the honest answer is to refuse rather than to store something that will
 * break sync later.
 */
export function renderPortrait({ image, scale, offset, frame, size = PORTRAIT_PX }) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'

  const { sx, sy, sWidth, sHeight } = sourceRect({
    imgW: image.naturalWidth || image.width,
    imgH: image.naturalHeight || image.height,
    scale, offset, frame,
  })
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, size, size)

  for (const quality of QUALITY_LADDER) {
    const dataUrl = canvas.toDataURL('image/webp', quality)
    // A browser that cannot encode WebP silently hands back a PNG data URL.
    // Accept it if it fits rather than looping five times to the same answer.
    const bytes = dataUrlBytes(dataUrl)
    if (bytes <= MAX_STORED_BYTES) return { dataUrl, bytes, quality }
    if (!dataUrl.startsWith('data:image/webp')) break
  }

  const fallback = canvas.toDataURL('image/jpeg', 0.6)
  const bytes = dataUrlBytes(fallback)
  if (bytes <= MAX_STORED_BYTES) return { dataUrl: fallback, bytes, quality: 0.6 }

  throw new Error('That image could not be shrunk small enough to store.')
}
