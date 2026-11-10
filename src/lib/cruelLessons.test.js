import { describe, it, expect } from 'vitest'
import { experienceEarned, maxExperienceFor, MAX_EXPERIENCE_PER_GAME } from './campaign.js'
import {
  experienceFor, holdsCruelLessons, canClaimCruelLessons, createLateClaim, pendingLateClaim,
  cruelLessonsGainedAt, cruelLessonsCountsFor, createAftermath,
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

/**
 * Audit v0.38.0 H1: the trigger counts only for games played after it was
 * taken. Records built as the app writes them — `createGame` stamps
 * `playedAt`, phase four appends to `advance.taken`, a claim to `late.taken`.
 */
describe('only after the trigger was taken', () => {
  const taking = { ...cruel, id: 'adv_take', boxIndex: 0, tableName: 'Attack Modification' }
  const finishedGame = (id, playedAt, taken = []) => createGame({
    id, week: 1, result: 'win', playedAt,
    aftermath: { ...createAftermath({ phase: 'determine_injuries' }), done: true,
      advance: { experienceEarned: 1, applied: true, boxesApplied: 1, taken } },
  })

  it('does not ask about the game whose phase four took it', () => {
    const open = createGame({ id: 'tonight', week: 3, result: 'win', playedAt: 3000, cruelLessons: true,
      aftermath: { ...createAftermath({ phase: 'advance_leader' }),
        advance: { experienceEarned: 0, taken: [taking] } } })
    const games = [finishedGame('g1', 1000), finishedGame('g2', 2000), open]
    expect(cruelLessonsCountsFor(open, withCruel, games)).toBe(false)
    // …and a stray tick cannot count either.
    expect(experienceFor(open, withCruel, games)).toBe(1)
  })

  it('offers the late claim only on games after the one that took it', () => {
    const games = [finishedGame('g1', 1000), finishedGame('g2', 2000, [taking]), finishedGame('g3', 3000)]
    expect(games.map((g) => canClaimCruelLessons(g, withCruel, games))).toEqual([false, false, true])
  })

  it('a trigger taken by a late claim counts only for games logged after the claim', () => {
    const g1 = finishedGame('g1', 1000)
    g1.aftermath.late = { ...createLateClaim('cruel-lessons', 1500), applied: true, done: true, taken: [taking] }
    const games = [g1, finishedGame('g2', 2000)]
    expect(cruelLessonsGainedAt(games)).toBe(1500)
    expect(cruelLessonsCountsFor(games[1], withCruel, games)).toBe(true)
    expect(cruelLessonsCountsFor(createGame({ playedAt: 1200 }), withCruel, games)).toBe(false)
  })

  it('refuses nothing when no record says when it arrived', () => {
    const games = [finishedGame('g1', 1000), finishedGame('g2', 2000)]
    expect(cruelLessonsGainedAt(games)).toBe(null)
    expect(games.every((g) => canClaimCruelLessons(g, withCruel, games))).toBe(true)
  })

  it('ignores a Cruel Lessons given to the totem', () => {
    const games = [finishedGame('g1', 1000, [{ ...taking, to: 'totem' }]), finishedGame('g2', 2000)]
    expect(cruelLessonsGainedAt(games)).toBe(null)
  })
})
