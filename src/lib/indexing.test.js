import { describe, it, expect } from 'vitest'
import { toIndexedModel, isSelectionSource, isVersatile, isTotem } from './indexing.js'
import { candidatesFor } from './validation.js'
import { FACTIONS, registerFaction } from '../data/factions.js'

/** A faction-index record, trimmed. This shape carries `characteristics`. */
const TEDDY = {
  slug: 'teddy',
  name: 'Teddy',
  display_name: 'Teddy',
  cost: 10,
  faction: 'neverborn',
  keywords: [{ name: 'Nightmare', slug: 'nightmare' }],
  characteristics: ['versatile', 'living'],
  actions: [{ name: 'Hugs', slug: 'hugs', type: 'attack', triggers: [] }],
  abilities: [{ name: 'Fear Made Manifest', slug: 'fear-made-manifest' }],
}

/** Cost 3, so it clears every Schemer ceiling — see the selection tests. */
const CHANGELING = {
  slug: 'changeling',
  name: 'Changeling',
  display_name: 'Changeling',
  cost: 3,
  faction: 'neverborn',
  station: 'minion',
  keywords: [{ name: 'Elite', slug: 'elite' }],
  characteristics: ['versatile', 'living'],
  actions: [{ name: 'Mimic', slug: 'mimic', type: 'attack', triggers: [] }],
  abilities: [{ name: 'Copycat', slug: 'copycat' }],
}

describe('isVersatile', () => {
  it('reads the characteristic off an indexed model', () => {
    expect(isVersatile(toIndexedModel(TEDDY))).toBe(true)
  })

  it('is case-insensitive, because the list is someone else’s free text', () => {
    expect(isVersatile({ characteristics: ['Versatile'] })).toBe(true)
    expect(isVersatile({ characteristics: ['VERSATILE'] })).toBe(true)
  })

  it('is false rather than throwing when characteristics are absent', () => {
    // Keyword-index records carry no characteristics at all until their
    // detail arrives, and hand-typed hires never carry any.
    expect(isVersatile({ characteristics: [] })).toBe(false)
    expect(isVersatile({})).toBe(false)
    expect(isVersatile(null)).toBe(false)
  })

  it('does not match a merely similar characteristic', () => {
    expect(isVersatile({ characteristics: ['versatility', 'unversatile'] })).toBe(false)
  })
})

describe('faction slugs', () => {
  /* The register answers an unknown faction with zero rows rather than an
     error, so a wrong slug here is a silent empty Versatile pool. */
  it('maps the two factions whose slugs diverge', () => {
    expect(registerFaction('ten-thunders')).toBe('ten_thunders')
    expect(registerFaction('explorers-society')).toBe('explorers_society')
  })

  it('passes the six that agree through unchanged', () => {
    for (const slug of ['guild', 'resurrectionists', 'arcanists', 'neverborn', 'outcasts', 'bayou']) {
      expect(registerFaction(slug)).toBe(slug)
    }
  })

  it('gives every faction a register slug', () => {
    for (const f of FACTIONS) expect(registerFaction(f.slug)).toBeTruthy()
  })

  it('returns null for an unknown faction instead of guessing', () => {
    expect(registerFaction('not-a-faction')).toBeNull()
    expect(registerFaction(undefined)).toBeNull()
  })

  it('never emits a hyphen, which is the shape that silently matches nothing', () => {
    for (const f of FACTIONS) expect(registerFaction(f.slug)).not.toContain('-')
  })
})

describe('Versatile does not widen leader selection', () => {
  /* Versatile governs hiring. A leader selection still needs keyword overlap
     (`checkSource`), so putting Versatile models into the roster must not make
     them legal sources. This is the regression that adding them could cause.

     Changeling rather than Teddy: at 3ss it clears every Schemer cost ceiling,
     so a rejection here can only be about the keyword. Teddy costs 10 and
     would be turned away on price, proving nothing. */
  const roster = [toIndexedModel(CHANGELING)]

  it('offers nothing when the leader shares no keyword with a Versatile model', () => {
    expect(candidatesFor('attack', roster, 'schemer', ['angler', 'banished'])).toEqual([])
    expect(candidatesFor('ability', roster, 'schemer', ['angler', 'banished'])).toEqual([])
  })

  it('still offers it when the leader did declare its keyword', () => {
    const rows = candidatesFor('attack', roster, 'schemer', ['elite', 'banished'])
    expect(rows.map((r) => r.name)).toEqual(['Mimic'])
  })

  it('remains a legal hire either way', () => {
    expect(isSelectionSource(toIndexedModel(CHANGELING))).toBe(true)
    expect(isSelectionSource(toIndexedModel(TEDDY))).toBe(true)
  })
})

/**
 * A totem exactly as the register serves one, verified against the live API in
 * v0.16.0: `cost: null`, `station: null`, and the fact in `characteristics`.
 *
 * Pinned as a fixture because the previous belief — that totems carry costs and
 * announce themselves through `station` — was wrong on both counts and survived
 * two audits by being written into a comment and a test name instead of checked.
 */
const JACKALOPE = {
  slug: 'jackalope',
  name: 'Jackalope',
  display_name: 'Jackalope',
  cost: null,
  station: null,
  faction: 'neverborn',
  keywords: [{ name: 'Chimera', slug: 'chimera' }],
  characteristics: ['totem', 'unique', 'beast'],
}

describe('totems', () => {
  it('are recognised by characteristic, not by station', () => {
    const indexed = toIndexedModel(JACKALOPE)
    expect(isTotem(indexed)).toBe(true)
    expect(indexed.station).toBe(null)
    expect(isTotem(toIndexedModel(TEDDY))).toBe(false)
  })

  it('never reach the hire picker', () => {
    expect(isSelectionSource(toIndexedModel(JACKALOPE))).toBe(false)
  })

  /**
   * Two independent guards, so neither is load-bearing alone. The cost test
   * catches every totem the register currently serves; the characteristic test
   * would catch one that gained a cost upstream.
   */
  it('stay out even if the register ever gives one a cost', () => {
    const priced = toIndexedModel({ ...JACKALOPE, cost: 4 })
    expect(priced.cost).toBe(4)
    expect(isTotem(priced)).toBe(true)
    expect(isSelectionSource(priced)).toBe(false)
  })

  it('are not mistaken for Versatile, which reads the same list', () => {
    expect(isVersatile(toIndexedModel(JACKALOPE))).toBe(false)
    expect(isTotem(toIndexedModel(TEDDY))).toBe(false)
    expect(isVersatile(toIndexedModel(TEDDY))).toBe(true)
  })
})
