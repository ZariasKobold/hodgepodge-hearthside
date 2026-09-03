import { describe, it, expect } from 'vitest'
import {
  createCampaign, createParticipation, createGame, CAMPAIGN_SCHEMA_VERSION,
  DEFAULT_HOUSE_RULES, hireRules,
  participants, participationForArsenal, participationForUser, activeParticipants,
  roleIn, visibleArsenalIds, seatArsenal, unseatArsenal, admitParticipant,
  joinedWeekFor, encounterCapFor,
  currentWeek, elapsedWeek, weeksRemaining, isCampaignOver, weekMode, WEEK_MODES,
  setWeekPatch, stepWeekPatch, canRegress, weekModePatch, weekAdjustment, offsetForWeek,
  gamesFor, gamesWon, gamesPlayed, gamesInWeek,
  belongsTo, shouldRelease,
} from './campaign.js'
import { createArsenal, createModel } from './arsenal.js'

const DAY = 86400000

describe('createCampaign', () => {
  it('is a table with nobody at it yet', () => {
    const c = createCampaign()
    expect(c.schemaVersion).toBe(CAMPAIGN_SCHEMA_VERSION)
    expect(c.participants).toEqual([])
    expect(c.games).toEqual([])
    expect(c.id.startsWith('cmp_')).toBe(true)
  })
  it('holds nothing personal — no leader, no arsenal, no scrip', () => {
    const c = createCampaign()
    expect(c.arsenals).toBeUndefined()
    expect(c.localArsenalId).toBeUndefined()
    expect(c.leader).toBeUndefined()
    expect(c.scrip).toBeUndefined()
  })
  it("defaults to the book's house rules", () => {
    expect(createCampaign().houseRules).toEqual(DEFAULT_HOUSE_RULES)
  })
})

describe('participation', () => {
  const seated = (patch) => createCampaign({ participants: [createParticipation(patch)] })

  it('seats an arsenal', () => {
    const c = createCampaign()
    const next = { ...c, participants: seatArsenal(c, { arsenalId: 'ars_1', userId: 'u1', role: 'host' }) }
    expect(next.participants).toHaveLength(1)
    expect(participationForArsenal(next, 'ars_1').userId).toBe('u1')
    expect(participationForUser(next, 'u1').arsenalId).toBe('ars_1')
  })
  it('updates rather than seating the same arsenal twice', () => {
    const c = seated({ arsenalId: 'ars_1', nickname: 'Dal' })
    const next = { ...c, participants: seatArsenal(c, { arsenalId: 'ars_1', nickname: 'Dalton' }) }
    expect(next.participants).toHaveLength(1)
    expect(next.participants[0].nickname).toBe('Dalton')
  })
  it('refuses a participation with no arsenal id', () => {
    expect(() => seatArsenal(createCampaign(), { userId: 'u1' })).toThrow(/arsenal id/)
  })
  it('unseats without touching anybody else', () => {
    const c = createCampaign({
      participants: [
        createParticipation({ arsenalId: 'ars_1' }),
        createParticipation({ arsenalId: 'ars_2' }),
      ],
    })
    expect(unseatArsenal(c, 'ars_1').map((p) => p.arsenalId)).toEqual(['ars_2'])
  })
  it('admits a pending member', () => {
    const c = createCampaign({
      participants: [createParticipation({ userId: 'u2', arsenalId: 'ars_2', status: 'pending' })],
    })
    expect(admitParticipant(c, 'u2')[0].status).toBe('active')
  })
  it('reports a role, never a boolean, so pending cannot pass for in', () => {
    const c = createCampaign({
      ownerUserId: 'host',
      participants: [
        createParticipation({ userId: 'host', arsenalId: 'ars_h', role: 'host' }),
        createParticipation({ userId: 'u2', arsenalId: 'ars_2', status: 'pending' }),
        createParticipation({ userId: 'u3', arsenalId: 'ars_3', status: 'active' }),
      ],
    })
    expect(roleIn(c, 'host')).toBe('host')
    expect(roleIn(c, 'u3')).toBe('player')
    expect(roleIn(c, 'u2')).toBeNull()
    expect(roleIn(c, 'stranger')).toBeNull()
  })
  it('reports the week a player joined, defaulting to one', () => {
    const c = createCampaign({
      participants: [
        createParticipation({ arsenalId: 'ars_1' }),
        createParticipation({ arsenalId: 'ars_2', joinedWeek: 4 }),
      ],
    })
    expect(joinedWeekFor(c, 'ars_1')).toBe(1)
    expect(joinedWeekFor(c, 'ars_2')).toBe(4)
    expect(joinedWeekFor(c, 'ars_missing')).toBe(1)
  })
})

describe('visibleArsenalIds', () => {
  // docs/data-model-v3.md, open question 4: "Can a host see a member's arsenal
  // before admitting them? No. Say so in a test."
  const c = createCampaign({
    ownerUserId: 'host',
    participants: [
      createParticipation({ userId: 'host', arsenalId: 'ars_h', role: 'host', status: 'active' }),
      createParticipation({ userId: 'u2', arsenalId: 'ars_2', status: 'active' }),
      createParticipation({ userId: 'u3', arsenalId: 'ars_3', status: 'pending' }),
    ],
  })

  it('shows the host the admitted arsenals and not the pending one', () => {
    const seen = visibleArsenalIds(c, 'host')
    expect(seen).toContain('ars_h')
    expect(seen).toContain('ars_2')
    expect(seen).not.toContain('ars_3')
  })
  it('shows a pending player their own arsenal and nobody else', () => {
    expect(visibleArsenalIds(c, 'u3')).toEqual(['ars_3'])
  })
  it('shows a stranger nothing at all', () => {
    expect(visibleArsenalIds(c, 'stranger')).toEqual([])
  })
  it('counts only active participants', () => {
    expect(activeParticipants(c)).toHaveLength(2)
    expect(participants(c)).toHaveLength(3)
  })
})

describe('encounterCapFor', () => {
  const of = (...costs) => createArsenal({ models: costs.map((c) => createModel({ cost: c })) })

  it('is the smaller arsenal total plus six', () => {
    // The book's own worked example: Nick 27, Amy 35, cap 33.
    expect(encounterCapFor([of(27), of(20, 15)])).toBe(33)
  })
  it('has no answer without an opponent', () => {
    expect(encounterCapFor([of(27)])).toBeNull()
    expect(encounterCapFor([])).toBeNull()
  })
  it('ignores annihilated models, which cannot be hired', () => {
    const wounded = createArsenal({
      models: [createModel({ cost: 27 }), createModel({ cost: 10, annihilated: true })],
    })
    expect(encounterCapFor([wounded, of(50)])).toBe(33)
  })
  it('takes the smallest at a table of more than two', () => {
    expect(encounterCapFor([of(40), of(27), of(35)])).toBe(33)
  })
})

describe('the week', () => {
  const start = Date.UTC(2026, 0, 1)
  const c = createCampaign({ startedAt: start })

  it('is week one on the first day', () => {
    expect(currentWeek(c, start)).toBe(1)
    expect(currentWeek(c, start + 6 * DAY)).toBe(1)
  })
  it('rolls on the designated day', () => {
    expect(currentWeek(c, start + 7 * DAY)).toBe(2)
    expect(currentWeek(c, start + 21 * DAY)).toBe(4)
  })
  it('honours a shorter week, which the book explicitly allows', () => {
    const fast = createCampaign({ startedAt: start, houseRules: { weekLengthDays: 3 } })
    expect(currentWeek(fast, start + 6 * DAY)).toBe(3)
  })
  it('never goes below one, even with a silly offset', () => {
    expect(currentWeek(createCampaign({ startedAt: start, weekOffset: -99 }), start)).toBe(1)
  })
  it('reports remaining weeks and completion', () => {
    expect(weeksRemaining(c, start + 70 * DAY)).toBe(1)
    expect(isCampaignOver(c, start + 70 * DAY)).toBe(false)
    expect(isCampaignOver(c, start + 84 * DAY)).toBe(true)
  })
  it('writes an offset, not a week, so the calendar keeps working', () => {
    const now = start + 21 * DAY                     // calendar says week 4
    const patch = setWeekPatch(c, 6, now)
    expect(patch).toEqual({ weekOffset: 2 })
    expect(currentWeek({ ...c, ...patch }, now)).toBe(6)
    // …and a week later it has moved on by itself.
    expect(currentWeek({ ...c, ...patch }, now + 7 * DAY)).toBe(7)
    expect(offsetForWeek(c, 6, now)).toBe(2)
    expect(elapsedWeek(c, now)).toBe(4)
  })
  it('steps forward and back, and stops at week one', () => {
    const now = start + 7 * DAY                      // week 2
    expect(currentWeek({ ...c, ...stepWeekPatch(c, 1, now) }, now)).toBe(3)
    expect(currentWeek({ ...c, ...stepWeekPatch(c, -1, now) }, now)).toBe(1)
    expect(canRegress(c, now)).toBe(true)
    expect(canRegress(c, start)).toBe(false)
  })
  it('switches modes without the number on screen moving', () => {
    const now = start + 21 * DAY                     // week 4
    const manual = { ...c, ...weekModePatch(c, 'manual', now) }
    expect(weekMode(manual)).toBe('manual')
    expect(currentWeek(manual, now)).toBe(4)
    // A manual campaign left alone stays where it is.
    expect(currentWeek(manual, now + 70 * DAY)).toBe(4)
    const back = { ...manual, ...weekModePatch(manual, 'calendar', now) }
    expect(currentWeek(back, now)).toBe(4)
    expect(currentWeek(back, now + 7 * DAY)).toBe(5)
  })
  it('reports no adjustment in manual mode, where there is no calendar to be off', () => {
    expect(weekAdjustment(createCampaign({ weekOffset: 3 }))).toBe(3)
    expect(weekAdjustment(createCampaign({ weekMode: 'manual', weekOffset: 3 }))).toBe(0)
    expect(WEEK_MODES).toEqual(['calendar', 'manual'])
  })
})

describe('games', () => {
  const c = createCampaign({
    games: [
      createGame({ arsenalId: 'ars_1', week: 1, result: 'win' }),
      createGame({ arsenalId: 'ars_1', week: 2, result: 'loss' }),
      createGame({ arsenalId: 'ars_2', week: 2, result: 'win' }),
    ],
  })
  it('scopes every tally to one arsenal', () => {
    expect(gamesFor(c, 'ars_1')).toHaveLength(2)
    expect(gamesPlayed(c, 'ars_1')).toBe(2)
    expect(gamesWon(c, 'ars_1')).toBe(1)
    expect(gamesWon(c, 'ars_2')).toBe(1)
    expect(gamesInWeek(c, 'ars_1', 2)).toHaveLength(1)
  })
})

describe('hireRules', () => {
  // Passing houseRules straight into hireCost silently does nothing — the names
  // differ, and an unrecognised key just falls back to the default.
  it('translates the stored names into the ones hireCost reads', () => {
    expect(hireRules(DEFAULT_HOUSE_RULES)).toEqual({
      allowNegative: false, surchargeBeforeDiscount: true,
    })
    expect(hireRules({ allowNegativeHireCost: true })).toEqual({
      allowNegative: true, surchargeBeforeDiscount: true,
    })
    expect(hireRules({})).toEqual({ allowNegative: false, surchargeBeforeDiscount: true })
  })
})

describe('ownership, shared by both kinds of object', () => {
  it('shows unclaimed work to anybody, so signing in can adopt it', () => {
    expect(belongsTo(createCampaign(), 'u1')).toBe(true)
    expect(belongsTo(createArsenal(), null)).toBe(true)
  })
  it('shows a claimed object only to its owner', () => {
    expect(belongsTo(createCampaign({ ownerUserId: 'u1' }), 'u1')).toBe(true)
    expect(belongsTo(createCampaign({ ownerUserId: 'u1' }), 'u2')).toBe(false)
    expect(belongsTo(createArsenal({ ownerUserId: 'u1' }), 'u2')).toBe(false)
  })
  it('does not release anything while auth is still being asked', () => {
    const theirs = createCampaign({ ownerUserId: 'u1' })
    expect(shouldRelease(theirs, null, false)).toBe(false)
    expect(shouldRelease(theirs, null, true)).toBe(true)
    expect(shouldRelease(theirs, 'u1', true)).toBe(false)
  })
})
