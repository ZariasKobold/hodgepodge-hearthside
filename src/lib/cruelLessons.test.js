import { describe, it, expect } from 'vitest'
import { experienceEarned, maxExperienceFor, MAX_EXPERIENCE_PER_GAME } from './campaign.js'
import {
  experienceFor, holdsCruelLessons, canClaimCruelLessons, createLateClaim, pendingLateClaim,
} from './aftermath.js'
import { aftermathDrift } from './repair.js'
import { summarisePhase } from './aftermathHistory.js'
import { createArsenal } from './shape/arsenal.js'
import { createGame } from './shape/campaign.js'

/**
 * Cruel Lessons (attack table, joker, p. 40): "Enemy leader only. After
 * killing, this model gains +1 experience point during this game's aftermath
 * phase." Reported by a player in v0.37.2: the app had no way to record it, so
 * the point — and the advancement its box granted — could not be had. v0.38.0.
 */

const cruel = { id: 'adv_c', tier: 1, tableId: 'attack', name: 'Cruel Lessons', to: 'leader' }
const withCruel = { advancementPath: 'bruiser', advancements: [cruel] }
const without = { advancementPath: 'bruiser', advancements: [] }

describe('experienceEarned with Cruel Lessons', () => {
  it('adds one point on top of the p. 31 three', () => {
    expect(experienceEarned({ path: 'bruiser', cruelLessons: true })).toBe(2)
    expect(experienceEarned({ path: 'bruiser', killedNonPeon: true, lost: true, cruelLessons: true })).toBe(4)
  })
  it('defaults to off, so every older caller is unchanged', () => {
    expect(experienceEarned({ path: 'bruiser', killedNonPeon: true, lost: true })).toBe(3)
  })
  it('moves the ceiling only for a leader who holds it', () => {
    expect(maxExperienceFor()).toBe(MAX_EXPERIENCE_PER_GAME)
    expect(maxExperienceFor({ cruelLessons: true })).toBe(MAX_EXPERIENCE_PER_GAME + 1)
  })
})

describe('holdsCruelLessons', () => {
  it('is the leader’s trigger, not the totem’s', () => {
    expect(holdsCruelLessons(withCruel)).toBe(true)
    expect(holdsCruelLessons(without)).toBe(false)
    expect(holdsCruelLessons({ advancements: [{ ...cruel, to: 'totem' }] })).toBe(false)
    expect(holdsCruelLessons(null)).toBe(false)
  })
  it('finds a row recorded before advancements carried ids', () => {
    expect(holdsCruelLessons({ advancements: [{ name: 'Cruel Lessons', tableId: 'attack' }] })).toBe(true)
  })
})

describe('experienceFor', () => {
  it('counts the game-log answer', () => {
    expect(experienceFor({ result: 'win', cruelLessons: true }, withCruel)).toBe(2)
    expect(experienceFor({ result: 'win', cruelLessons: false }, withCruel)).toBe(1)
  })
  it('ignores the answer on a leader without the trigger', () => {
    expect(experienceFor({ result: 'win', cruelLessons: true }, without)).toBe(1)
  })
})

describe('the late claim', () => {
  const done = (over = {}) => createGame({
    id: 'gam_1', week: 1, result: 'win', aftermath: { done: true, advance: { applied: true } }, ...over,
  })

  it('is offered on a finished game of a leader who holds the trigger', () => {
    expect(canClaimCruelLessons(done(), withCruel)).toBe(true)
  })
  it('is not offered when it would count twice or cannot count at all', () => {
    expect(canClaimCruelLessons(done({ cruelLessons: true }), withCruel)).toBe(false)
    expect(canClaimCruelLessons(done(), without)).toBe(false)
    const claimed = done()
    claimed.aftermath.late = createLateClaim()
    expect(canClaimCruelLessons(claimed, withCruel)).toBe(false)
    expect(canClaimCruelLessons(done({ aftermath: { done: false } }), withCruel)).toBe(false)
    // An early withdrawal plays no advancement phase, so it earns no point.
    expect(canClaimCruelLessons(done({ withdrew: true, withdrewOnTurn: 2 }), withCruel)).toBe(false)
  })
  it('finds the unfinished claim, and only that one', () => {
    const open = done({ id: 'a' })
    open.aftermath.late = createLateClaim()
    const finished = done({ id: 'b' })
    finished.aftermath.late = { ...createLateClaim(), done: true }
    expect(pendingLateClaim([finished, open])?.id).toBe('a')
    expect(pendingLateClaim([finished])).toBe(null)
  })

  it('is provenance for the drift check, like phase four', () => {
    const arsenal = createArsenal({ leader: { experience: { boxesChecked: 3 } } })
    const late = {
      ...createLateClaim(), applied: true, done: true, boxesApplied: 1,
      taken: [{ id: 'adv_late', tableId: 'attack', name: 'Maim', to: 'leader' }],
    }
    const campaign = {
      games: [{
        id: 'g', arsenalId: arsenal.id, week: 1,
        aftermath: { done: true, advance: { applied: true, boxesApplied: 3, taken: [] }, late },
      }],
    }
    const d = aftermathDrift(arsenal, campaign)
    expect(d.boxes).toBe(1)
    expect(d.advancements.map((x) => x.entry.name)).toEqual(['Maim'])
  })

  it('a healthy arsenal after a claim reports no drift', () => {
    const arsenal = createArsenal({
      leader: { experience: { boxesChecked: 4 }, advancements: [{ id: 'adv_late', name: 'Maim' }] },
    })
    const late = { ...createLateClaim(), applied: true, done: true, boxesApplied: 1, taken: [{ id: 'adv_late', name: 'Maim', to: 'leader' }] }
    const campaign = {
      games: [{ id: 'g', arsenalId: arsenal.id, aftermath: { done: true, advance: { applied: true, boxesApplied: 3 }, late } }],
    }
    const d = aftermathDrift(arsenal, campaign)
    expect(d.boxes).toBe(0)
    expect(d.advancements).toEqual([])
  })

  it('is said in the history, apart from the night itself', () => {
    const record = {
      advance: { applied: true, boxesApplied: 1, taken: [] },
      late: { ...createLateClaim(), applied: true, done: true, boxesApplied: 1, taken: [{ name: 'Maim', appliesTo: { name: 'Claws' } }] },
    }
    const lines = summarisePhase(record, 'advance_leader')
    expect(lines[0]).toBe('Crossed 1 experience box.')
    expect(lines[1]).toBe('One more experience point from Cruel Lessons, claimed later, crossing 1 box: took Maim on Claws.')
  })
  it('says an unfinished claim is unfinished', () => {
    const record = { advance: { applied: true }, late: createLateClaim() }
    expect(summarisePhase(record, 'advance_leader').at(-1)).toMatch(/not finished yet/)
  })
})
