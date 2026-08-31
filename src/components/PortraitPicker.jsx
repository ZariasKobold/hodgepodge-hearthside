import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACCEPTED_TYPES,
  MAX_ZOOM,
  clampOffset,
  clampScale,
  coverScale,
  centredOffset,
  loadImage,
  releaseImage,
  renderPortrait,
  validateSource,
} from '../lib/portrait.js'

/**
 * Choose a picture of the model, then pick the circle out of it.
 *
 * The frame is a fixed 260px because the crop maths is expressed in frame
 * space: what is dragged is what is stored. Measuring a fluid container would
 * mean the same drag produced a different crop on a phone than on a laptop.
 *
 * The circle is a mask over a square frame, and the square is what gets
 * stored — see the note in `lib/portrait.js`. The dimmed corners are therefore
 * honest about what is kept: they are still in the file, they are simply not
 * shown anywhere the portrait is displayed.
 *
 * Dragging is not the only way to move the image. The frame takes focus and
 * answers the arrow keys, because a pointer-only cropper is unusable for
 * anyone who does not have a pointer.
 */

const FRAME = 260
const NUDGE = 12

export default function PortraitPicker({ value, onChange, name }) {
  const [image, setImage] = useState(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const dragRef = useRef(null)
  const imageRef = useRef(null)

  const dims = image
    ? { w: image.naturalWidth || image.width, h: image.naturalHeight || image.height }
    : null
  const minScale = dims ? coverScale(dims.w, dims.h, FRAME) : 1

  // A zoomed-in crop that is then zoomed out must not strand the image with a
  // gap at one edge, so the offset is re-clamped whenever the scale changes.
  useEffect(() => {
    if (!dims) return
    setOffset((o) => clampOffset(o, dims.w, dims.h, scale, FRAME))
  }, [scale, dims?.w, dims?.h])

  /**
   * Drops the working image and frees its object URL. Every exit from the
   * editor goes through here — saved, cancelled, replaced, or unmounted —
   * because the URL is held for as long as the preview is on screen and
   * nothing else will release it.
   */
  const clearImage = useCallback(() => {
    setImage((prev) => { releaseImage(prev); return null })
  }, [])

  // Unmounting mid-crop (switching wizard step, closing the campaign) has to
  // free the URL too, and the cleanup closure cannot read `image` directly
  // without re-subscribing on every pan.
  imageRef.current = image
  useEffect(() => () => releaseImage(imageRef.current), [])

  async function pick(event) {
    const file = event.target.files?.[0]
    event.target.value = ''            // so re-choosing the same file re-fires
    setError(null)

    const check = validateSource(file)
    if (!check.ok) { setError(check.error); return }

    try {
      const img = await loadImage(file)
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      const initial = coverScale(w, h, FRAME)
      setImage((prev) => { releaseImage(prev); return img })
      setScale(initial)
      setOffset(centredOffset(w, h, initial, FRAME))
    } catch (err) {
      setError(err.message)
    }
  }

  const move = useCallback((dx, dy) => {
    if (!dims) return
    setOffset((o) => clampOffset(
      { x: o.x + dx, y: o.y + dy }, dims.w, dims.h, scale, FRAME
    ))
  }, [dims?.w, dims?.h, scale])

  function onPointerDown(event) {
    if (!image) return
    // Taking pointer capture stops the browser moving focus here on its own,
    // which silently broke arrow-key panning: the frame looked interactive,
    // answered the mouse, and ignored the keyboard until it was tabbed to.
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY }
  }

  function onPointerMove(event) {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    dragRef.current = { x: event.clientX, y: event.clientY }
    move(dx, dy)
  }

  function onPointerUp(event) {
    if (dragRef.current) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      dragRef.current = null
    }
  }

  function onKeyDown(event) {
    const steps = {
      ArrowLeft: [NUDGE, 0], ArrowRight: [-NUDGE, 0],
      ArrowUp: [0, NUDGE], ArrowDown: [0, -NUDGE],
    }
    const step = steps[event.key]
    if (!step) return
    event.preventDefault()
    move(step[0], step[1])
  }

  function save() {
    if (!image) return
    setBusy(true)
    setError(null)
    try {
      const { dataUrl } = renderPortrait({ image, scale, offset, frame: FRAME })
      onChange(dataUrl)
      clearImage()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    clearImage()
    setError(null)
  }

  return (
    <div className="portrait">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={pick}
        className="portrait__input"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!image && (
        <div className="portrait__resting">
          <div className="portrait__preview">
            {value
              ? <img src={value} alt={name ? `Portrait of ${name}` : 'Leader portrait'} />
              : <span className="portrait__blank" aria-hidden="true" />}
          </div>
          <div className="portrait__resting-actions">
            <button type="button" className="btn btn--ghost" onClick={() => inputRef.current?.click()}>
              {value ? 'Change picture' : 'Add a picture'}
            </button>
            {value && (
              <button type="button" className="portrait__remove" onClick={() => onChange(null)}>
                Remove
              </button>
            )}
            <p className="note portrait__hint">
              A photo of the model standing in for this leader. It is stored in
              the campaign itself, so it exports and syncs with everything else.
            </p>
          </div>
        </div>
      )}

      {image && (
        <div className="portrait__editor">
          <div
            className="portrait__frame"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="group"
            aria-label="Drag to move the picture, or use the arrow keys"
          >
            <img
              className="portrait__source"
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: dims.w * scale,
                height: dims.h * scale,
                transform: `translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
            <span className="portrait__mask" aria-hidden="true" />
          </div>

          <label className="portrait__zoom">
            <span className="label">Zoom</span>
            <input
              type="range"
              min={minScale}
              max={minScale * MAX_ZOOM}
              step={minScale / 100}
              value={scale}
              onChange={(e) => setScale(clampScale(Number(e.target.value), dims.w, dims.h, FRAME))}
            />
          </label>

          <div className="portrait__actions">
            <button type="button" className="btn" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Use this crop'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={cancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="note note--warn portrait__error">{error}</p>}
    </div>
  )
}
