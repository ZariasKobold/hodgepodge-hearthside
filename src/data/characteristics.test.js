import { describe, it, expect } from 'vitest'
import {
  CHARACTERISTICS, LEADER_CHARACTERISTICS, NOT_ON_A_LEADER, characteristicOptions,
} from './characteristics.js'

/**
 * These assert the *shape* of the lists rather than their contents, deliberately.
 *
 * A test that re-listed all 23 names would be transcribed from the same source
 * as the list itself and would agree with it however wrong both were — the trap
 * CLAUDE.md names about the book's data files. What is worth pinning here is
 * everything a future edit could break by hand: order, duplicates, the three
 * retired values, the three excluded ones, and the one-way door that keeps a
 * value the list no longer offers removable.
 */
describe('the full characteristic list', () => {
  it('holds the 23 the register serves', () => {
    // 798 characters across all eight factions, tallied 2026-08-31. If this
    // number moves, the register moved — go and look rather than editing it.
    expect(CHARACTERISTICS).toHaveLength(23)
  })

  it('is sorted and free of duplicates, because it is rendered in order', () => {
    expect([...CHARACTERISTICS].sort((a, b) => a.localeCompare(b))).toEqual(CHARACTERISTICS)
    expect(new Set(CHARACTERISTICS).size).toBe(CHARACTERISTICS.length)
  })

  it('no longer offers the three that were never characteristics', () => {
    // Nightmare is a keyword; Spirit and Mimic are neither, in Fourth Edition.
    for (const gone of ['Nightmare', 'Spirit', 'Mimic']) {
      expect(CHARACTERISTICS).not.toContain(gone)
    }
  })

  it('is Title Case, since these print on the record and the sheet', () => {
    for (const c of CHARACTERISTICS) expect(c).toMatch(/^[A-Z][a-z]+$/)
  })
})

describe('what a leader may be given', () => {
  it('is the full set less the three that contradict a rule', () => {
    expect(LEADER_CHARACTERISTICS).toHaveLength(CHARACTERISTICS.length - NOT_ON_A_LEADER.length)
    for (const c of NOT_ON_A_LEADER) expect(LEADER_CHARACTERISTICS).not.toContain(c)
  })

  it('excludes exactly Henchman, Totem and Versatile', () => {
    // Named rather than counted: each is excluded for its own reason, and a
    // fourth arriving silently is the thing this catches.
    expect([...NOT_ON_A_LEADER].sort()).toEqual(['Henchman', 'Totem', 'Versatile'])
  })

  it('keeps Unique, which is a waste to pick rather than a contradiction', () => {
    expect(LEADER_CHARACTERISTICS).toContain('Unique')
  })

  it('every excluded name is a real characteristic, not a typo', () => {
    // The exclusions are a house rule applied to the game's list. A name here
    // that the register never returns would silently exclude nothing.
    for (const c of NOT_ON_A_LEADER) expect(CHARACTERISTICS).toContain(c)
  })

  it('stays in the full set order', () => {
    expect(LEADER_CHARACTERISTICS).toEqual(
      CHARACTERISTICS.filter((c) => !NOT_ON_A_LEADER.includes(c))
    )
  })
})

describe('characteristicOptions', () => {
  it('is the leader list when a leader has picked nothing', () => {
    expect(characteristicOptions([])).toEqual(LEADER_CHARACTERISTICS)
    expect(characteristicOptions()).toEqual(LEADER_CHARACTERISTICS)
  })

  it('draws a retired characteristic the leader still holds', () => {
    // The point of the function. Without this the value stays on the leader,
    // prints on the sheet, counts against the limit of two, and cannot be
    // switched off — stuck rather than merely obsolete.
    const options = characteristicOptions(['Nightmare'])
    expect(options).toContain('Nightmare')
    expect(options).toHaveLength(LEADER_CHARACTERISTICS.length + 1)
  })

  it('draws an excluded characteristic that arrived on an imported leader', () => {
    // An import is a file this app does not get to vet, so 'Totem' can arrive
    // on a leader even though no picker would ever offer it.
    const options = characteristicOptions(['Totem'])
    expect(options).toContain('Totem')
    expect(options).toHaveLength(LEADER_CHARACTERISTICS.length + 1)
  })

  it('keeps the result sorted once a stranger is added', () => {
    const options = characteristicOptions(['Nightmare'])
    expect([...options].sort((a, b) => a.localeCompare(b))).toEqual(options)
  })

  it('does not double up a selection that is already on the list', () => {
    expect(characteristicOptions(['Living', 'Construct'])).toEqual(LEADER_CHARACTERISTICS)
  })

  it('ignores blanks and non-strings rather than drawing an empty chip', () => {
    expect(characteristicOptions(['', '   ', null, undefined, 7])).toEqual(LEADER_CHARACTERISTICS)
  })

  it('takes another base, for the totem picker the book allows', () => {
    // A totem may be a Totem, so its excluded set is not the leader's.
    expect(characteristicOptions([], CHARACTERISTICS)).toEqual(CHARACTERISTICS)
  })
})
