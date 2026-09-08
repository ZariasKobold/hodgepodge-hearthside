import { describe, it, expect } from 'vitest'
import {
  describeFlip, summarisePhase, summariseAftermath, summariseGame,
} from './aftermathHistory.js'

describe('describeFlip', () => {
  it('names the card and its suit', () => {
    expect(describeFlip({ value: 8, suit: 'tome' })).toBe('8 of Tomes')
  })
  it('names both jokers', () => {
    expect(describeFlip({ value: 'blackJoker' })).toBe('Black Joker')
    expect(describeFlip({ value: 'redJoker', suit: 'ram' })).toBe('Red Joker of Rams')
  })
  it('says when a flip was cheated', () => {
    expect(describeFlip({ value: 10, suit: 'crow', cheated: true })).toBe('10 of Crows (cheated)')
  })
  it('is nothing at all when no card was typed in', () => {
    expect(describeFlip({})).toBeNull()
    expect(describeFlip()).toBeNull()
  })
})

describe('summarisePhase', () => {
  it('is empty for a phase with nothing in it', () => {
    expect(summarisePhase({}, 'barter')).toEqual([])
    expect(summarisePhase(null, 'barter')).toEqual([])
  })

  it('reads the payday', () => {
    expect(summarisePhase({ paid: true, scripEarned: 3 }, 'payday')).toEqual(['Collected 3 scrip.'])
  })

  it('reads a barter with a purchase', () => {
    const record = {
      barter: {
        flipped: true, value: 4, suit: 'tome',
        bought: [{ name: 'Gatling Gun', cc: 2 }],
      },
    }
    expect(summarisePhase(record, 'barter')).toEqual([
      'Barter flip: 4 of Tomes.',
      'Bought Gatling Gun for 2 scrip.',
    ])
  })

  /** A flip that bought nothing is a decision, and it should be legible as one. */
  it('says so when a barter flip bought nothing', () => {
    const record = { barter: { flipped: true, value: 2, suit: 'ram', bought: [] } }
    expect(summarisePhase(record, 'barter')).toEqual([
      'Barter flip: 2 of Rams.',
      'Bought nothing.',
    ])
  })

  /**
   * The action an advancement went on is the half the app threw away until
   * v0.22.2, and the half a player checking their card is looking for.
   */
  it('names the action an advancement was applied to', () => {
    const record = {
      advance: {
        applied: true,
        boxesApplied: 3,
        taken: [{
          name: 'Skill Boost', tableName: 'Tactical Modification',
          flipValue: 8, cheated: true,
          appliesTo: { name: 'Carry the Flame' },
        }],
      },
    }
    expect(summarisePhase(record, 'advance_leader')).toEqual([
      'Skill Boost on Carry the Flame from Tactical Modification — flipped 8 (cheated).',
      'Crossed 3 experience boxes.',
    ])
  })

  it('reads an advancement that never got a target', () => {
    const record = { advance: { applied: true, taken: [{ name: 'Cruel Lessons' }] } }
    expect(summarisePhase(record, 'advance_leader')).toEqual(['Cruel Lessons.'])
  })

  /**
   * Two of Dr. Mo's seven results heal and then hurt. A ledger reading only
   * "healed" over an arsenal that also gained an injury is the v0.22.6 bug, and
   * the history must not reintroduce it in prose.
   */
  it('names the injury the doctor handed back', () => {
    const record = {
      doctor: {
        attempts: [{
          injuryName: 'Broken Arm', flipValue: 6,
          outcome: { heals: true }, hurt: { name: 'Oops?' },
        }],
      },
    }
    expect(summarisePhase(record, 'back_alley_doctor')).toEqual([
      'Broken Arm — healed, gained Oops? (6).',
    ])
  })

  it('reads the injury flips and the annihilations', () => {
    const record = {
      done: true,
      injuries: {
        flips: [
          { subjectName: 'Death Marshal', result: { attaches: true, name: 'Leadfooted' }, flipValue: 4 },
          { subjectName: 'Lampad', result: { attaches: false } },
        ],
      },
      annihilatedNames: ['Death Marshal'],
    }
    expect(summarisePhase(record, 'determine_injuries')).toEqual([
      'Death Marshal — Leadfooted (4).',
      'Lampad — no injury.',
      'Death Marshal was annihilated.',
    ])
  })

  it('says nobody was hurt rather than going blank on a finished phase', () => {
    expect(summarisePhase({ done: true, injuries: { flips: [] } }, 'determine_injuries'))
      .toEqual(['Nobody was hurt.'])
  })
})

describe('summariseAftermath', () => {
  /**
   * Every phase appears, empty ones included. A history that omits the phases
   * nothing happened in cannot be read as "the doctor was not visited" — it
   * reads as the app having forgotten, which is the doubt this view exists to
   * remove.
   */
  it('returns all six phases in order, including the empty ones', () => {
    const out = summariseAftermath({ aftermath: { paid: true, scripEarned: 1 } })
    expect(out.map((p) => p.id)).toEqual([
      'draw_hand', 'payday', 'barter', 'advance_leader',
      'back_alley_doctor', 'determine_injuries',
    ])
    expect(out[1].lines).toEqual(['Collected 1 scrip.'])
    expect(out[2].lines).toEqual([])
  })

  it('is empty for a game with no aftermath at all', () => {
    expect(summariseAftermath({})).toEqual([])
    expect(summariseAftermath(null)).toEqual([])
  })

  /** A forfeited phase is not an empty one, and must not read as a choice. */
  it('marks a skipped phase rather than calling it empty', () => {
    const out = summariseAftermath({ aftermath: { skippedPhases: ['barter'] } })
    expect(out.find((p) => p.id === 'barter').skipped).toBe(true)
  })
})

describe('summariseGame', () => {
  it('reads the line a player recognises', () => {
    expect(summariseGame({
      week: 1, opponent: 'Dalton', strategy: 'Plant Explosives',
      result: 'loss', vpSelf: 3, vpOpponent: 4,
      aftermath: { scripEarned: 1 },
    })).toEqual({
      week: 1, opponent: 'Dalton', strategy: 'Plant Explosives',
      result: 'lost', vp: '3–4', scrip: 1, withdrew: false,
    })
  })

  it('is null for no game', () => {
    expect(summariseGame(null)).toBeNull()
  })
})
