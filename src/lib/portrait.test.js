import { describe, it, expect } from 'vitest'
import {
  validateSource,
  coverScale,
  clampScale,
  clampOffset,
  centredOffset,
  sourceRect,
  dataUrlBytes,
  fitsBudget,
  MAX_SOURCE_BYTES,
  MAX_STORED_BYTES,
  MAX_ZOOM,
} from './portrait.js'

const file = (type, size) => ({ type, size })

describe('validateSource', () => {
  it('accepts the formats a phone or a camera actually produces', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/avif']) {
      expect(validateSource(file(type, 1000)).ok).toBe(true)
    }
  })

  it('refuses a file that is not an image', () => {
    const result = validateSource(file('application/pdf', 1000))
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/PNG, JPEG/)
  })

  it('refuses an oversized source before anything tries to decode it', () => {
    const result = validateSource(file('image/jpeg', MAX_SOURCE_BYTES + 1))
    expect(result.ok).toBe(false)
    // The message has to name both numbers or the player cannot act on it.
    expect(result.error).toMatch(/12 MB/)
  })

  it('refuses nothing at all without throwing', () => {
    expect(validateSource(null).ok).toBe(false)
    expect(validateSource(undefined).ok).toBe(false)
  })
})

describe('coverScale', () => {
  it('scales a wide image by its short edge', () => {
    expect(coverScale(400, 200, 200)).toBe(1)
  })

  it('scales a tall image by its short edge', () => {
    expect(coverScale(200, 400, 200)).toBe(1)
  })

  it('enlarges an image smaller than the frame', () => {
    expect(coverScale(100, 100, 200)).toBe(2)
  })

  it('never returns a scale that leaves a gap', () => {
    for (const [w, h] of [[300, 900], [900, 300], [512, 513], [17, 4000]]) {
      const s = coverScale(w, h, 260)
      expect(w * s).toBeGreaterThanOrEqual(260 - 1e-9)
      expect(h * s).toBeGreaterThanOrEqual(260 - 1e-9)
    }
  })
})

describe('clampScale', () => {
  it('floors at cover so the crop can never show an empty corner', () => {
    expect(clampScale(0.01, 400, 200, 200)).toBe(1)
  })

  it('caps zoom', () => {
    expect(clampScale(9999, 400, 200, 200)).toBe(MAX_ZOOM)
  })

  it('falls back to cover on a broken number', () => {
    expect(clampScale(NaN, 400, 200, 200)).toBe(1)
  })
})

describe('clampOffset', () => {
  const W = 400, H = 200, F = 200, S = 1

  it('keeps the frame covered on both axes', () => {
    expect(clampOffset({ x: 50, y: 50 }, W, H, S, F)).toEqual({ x: 0, y: 0 })
    expect(clampOffset({ x: -9999, y: -9999 }, W, H, S, F)).toEqual({ x: -200, y: 0 })
  })

  it('never returns a positive offset, which would expose the frame edge', () => {
    const o = clampOffset({ x: 10, y: 10 }, W, H, S, F)
    expect(o.x).toBeLessThanOrEqual(0)
    expect(o.y).toBeLessThanOrEqual(0)
  })

  it('survives a scale that leaves the image smaller than the frame', () => {
    // clampScale prevents this, but clampOffset is called from a drag handler
    // and must not produce NaN if it ever happens.
    const o = clampOffset({ x: -50, y: -50 }, 100, 100, 1, 200)
    expect(Number.isFinite(o.x)).toBe(true)
    expect(Number.isFinite(o.y)).toBe(true)
  })

  it('treats a missing offset as the origin', () => {
    expect(clampOffset(undefined, W, H, S, F)).toEqual({ x: 0, y: 0 })
  })
})

describe('centredOffset', () => {
  it('centres a wide image horizontally and pins it vertically', () => {
    expect(centredOffset(400, 200, 1, 200)).toEqual({ x: -100, y: 0 })
  })
})

describe('sourceRect', () => {
  it('takes the middle square of a centred wide image', () => {
    const r = sourceRect({
      imgW: 400, imgH: 200, scale: 1, offset: { x: -100, y: 0 }, frame: 200,
    })
    expect(r).toEqual({ sx: 100, sy: 0, sWidth: 200, sHeight: 200 })
  })

  it('is always square, because the output canvas is', () => {
    const r = sourceRect({
      imgW: 900, imgH: 300, scale: 2, offset: { x: -300, y: -40 }, frame: 260,
    })
    expect(r.sWidth).toBe(r.sHeight)
  })

  it('never reads outside the image, at any pan or zoom', () => {
    const imgW = 640, imgH = 481, frame = 260
    for (const scale of [coverScale(imgW, imgH, frame), 1, 2.5, 7]) {
      for (const off of [{ x: 0, y: 0 }, { x: -99999, y: -99999 }, { x: 5, y: 5 }]) {
        const r = sourceRect({ imgW, imgH, scale, offset: off, frame })
        expect(r.sx).toBeGreaterThanOrEqual(0)
        expect(r.sy).toBeGreaterThanOrEqual(0)
        expect(r.sx + r.sWidth).toBeLessThanOrEqual(imgW + 1e-9)
        expect(r.sy + r.sHeight).toBeLessThanOrEqual(imgH + 1e-9)
      }
    }
  })
})

describe('dataUrlBytes', () => {
  it('counts unpadded base64', () => {
    expect(dataUrlBytes('data:image/webp;base64,AAAA')).toBe(3)
  })

  it('discounts one and two padding characters', () => {
    expect(dataUrlBytes('data:image/webp;base64,AAA=')).toBe(2)
    expect(dataUrlBytes('data:image/webp;base64,AA==')).toBe(1)
  })

  it('returns zero rather than throwing on rubbish', () => {
    expect(dataUrlBytes('')).toBe(0)
    expect(dataUrlBytes(null)).toBe(0)
    expect(dataUrlBytes('not-a-data-url')).toBe(0)
    expect(dataUrlBytes('data:image/webp;base64,')).toBe(0)
  })
})

describe('fitsBudget', () => {
  // The budget is what keeps a campaign under D1's ~1MB row cap. A portrait
  // that passes upload but fails sync would break on a device the player is
  // not looking at, so this is asserted rather than assumed.
  it('is well under D1 row size, leaving room for the rest of the campaign', () => {
    expect(MAX_STORED_BYTES).toBeLessThan(1_000_000 / 4)
  })

  it('passes something inside the budget and fails something over it', () => {
    const under = 'data:image/webp;base64,' + 'A'.repeat(1000)
    expect(fitsBudget(under)).toBe(true)

    const over = 'data:image/webp;base64,' + 'A'.repeat(MAX_STORED_BYTES * 2)
    expect(fitsBudget(over)).toBe(false)
  })
})
