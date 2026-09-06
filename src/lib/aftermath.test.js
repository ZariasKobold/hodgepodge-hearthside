import { describe, it, expect } from 'vitest'
import {
  withdrewEarly, phasesFor, firstPhase, nextPhase, createAftermath,
  handFor, paydayFor, paydayBreakdown,
  barterStock, thirstStock, reachesThirst,
  tierOfBox, boxesCrossed, experienceWasted, trackIsFull, TOTAL_EXPERIENCE_BOXES,
  doctorOutcome, doctorAffordable,
  modelsToFlipFor, resolveInjuryFlip, resolveLuckyMiss, annihilatedAfterInjuries,
  resolveDoctorInjury, doomedSubjects,
} from './aftermath.js'
import { EXPERIENCE_TRACK, EXPERIENCE_BOXES, offerFor, findTable } from '../data/advancements.js'
import { BARTER, THIRST, barterOffer, thirstOffer, ALWAYS } from '../data/equipment.js'
import { INJURY_TABLE, injuryResult, doctorResult, luckyMissResult } from '../data/injuries.js'

/* ── the walk ───────────────────────────────────────────────────── */

describe('phases', () => {
  it('runs all six for an ordinary game', () => {
    const g = { withdrew: false }
    expect(phasesFor(g).filter((p) => p.skipped)).toHaveLength(0)
    expect(firstPhase(g)).toBe('draw_hand')
    expect(nextPhase(g, 'draw_hand')).toBe('payday')
    expect(nextPhase(g, 'determine_injuries')).toBe(null)
  })

  it('skips everything but injuries after an early withdrawal', () => {
    const g = { withdrew: true, withdrewOnTurn: 2 }
    expect(withdrewEarly(g)).toBe(true)
    expect(phasesFor(g).filter((p) => !p.skipped).map((p) => p.id)).toEqual(['determine_injuries'])
    expect(firstPhase(g)).toBe('determine_injuries')
  })

  it('treats turn three as an ordinary withdrawal', () => {
    const g = { withdrew: true, withdrewOnTurn: 3 }
    expect(withdrewEarly(g)).toBe(false)
    expect(phasesFor(g).filter((p) => p.skipped)).toHaveLength(0)
  })

  it('says why a phase is skipped rather than dropping it silently', () => {
    const skipped = phasesFor({ withdrew: true, withdrewOnTurn: 1 }).find((p) => p.skipped)
    expect(skipped.reason).toMatch(/turn two/)
  })

  it('starts blank and unfinished', () => {
    const a = createAftermath()
    expect(a.done).toBe(false)
    expect(a.barter.bought).toEqual([])
    expect(a.injuries.flips).toEqual([])
  })
})

/* ── phases 1 and 2 ─────────────────────────────────────────────── */

describe('hand and payday', () => {
  it('caps the hand at four', () => {
    expect(handFor({ withdrew: false, schemesCompleted: 3 })).toBe(4)
    expect(handFor({ withdrew: false, schemesCompleted: 9 })).toBe(4)
  })

  it('gives no hand at all to an early withdrawal', () => {
    expect(handFor({ withdrew: true, withdrewOnTurn: 1, schemesCompleted: 3 })).toBe(0)
  })

  it('reads the result rather than being told whether you won', () => {
    expect(paydayFor({ vpSelf: 4, result: 'win' })).toBe(3)
    expect(paydayFor({ vpSelf: 4, result: 'loss' })).toBe(2)
  })

  /**
   * A breakdown that can disagree with the number beside it is worse than no
   * breakdown, so the parts are asserted to sum to what `payday` returns.
   */
  it('breaks down to exactly the total it is shown beside', () => {
    const games = [
      { vpSelf: 4, result: 'win', campaignRatingSelf: -1, campaignRatingOpponent: 2 },
      { vpSelf: 0, result: 'loss', campaignRatingSelf: 3, campaignRatingOpponent: -2 },
      { vpSelf: 7, result: 'draw', campaignRatingSelf: 0, campaignRatingOpponent: 0 },
      { vpSelf: 2, result: 'win', campaignRatingSelf: 0, campaignRatingOpponent: 0 },
    ]
    for (const g of games) {
      const b = paydayBreakdown(g)
      expect(b.parts.reduce((n, p) => n + p.value, 0)).toBe(b.total)
      expect(b.total).toBe(paydayFor(g))
    }
  })

  it('forfeits the lot on an early withdrawal', () => {
    const b = paydayBreakdown({ vpSelf: 6, result: 'win', withdrew: true, withdrewOnTurn: 2 })
    expect(b.forfeited).toBe(true)
    expect(b.total).toBe(0)
  })
})

/* ── phase 3 ────────────────────────────────────────────────────── */

describe('barter', () => {
  it('always has the four always-available items on the counter', () => {
    const always = BARTER.filter((e) => e.br === ALWAYS)
    expect(always).toHaveLength(4)
    for (const v of [1, 7, 13]) {
      for (const s of ['ram', 'crow']) {
        const stock = barterStock(v, s, { scrip: 99 })
        for (const a of always) expect(stock.some((e) => e.id === a.id)).toBe(true)
      }
    }
  })

  it('matches value AND suit, not either', () => {
    const crows = barterOffer(7, 'crow').filter((e) => e.br !== ALWAYS)
    const rams = barterOffer(7, 'ram').filter((e) => e.br !== ALWAYS)
    expect(crows.every((e) => e.suits.includes('crow'))).toBe(true)
    expect(rams.every((e) => e.suits.includes('ram'))).toBe(true)
    expect(crows.some((e) => rams.includes(e))).toBe(false)
  })

  it('shows only the always-available stock until a suit is given', () => {
    expect(barterStock(7, null, { scrip: 99 }).every((e) => e.br === ALWAYS)).toBe(true)
  })

  it('marks what the scrip on hand cannot reach', () => {
    const stock = barterStock(1, 'crow', { scrip: 2 })
    const coat = stock.find((e) => e.id === 'lead-lined-coat')
    expect(coat.cc).toBe(3)
    expect(coat.affordable).toBe(false)
  })

  it('reaches Those Who Thirst only on a red joker that was flipped', () => {
    expect(reachesThirst({ value: 'redJoker', cheated: false })).toBe(true)
    expect(reachesThirst({ value: 'redJoker', cheated: true })).toBe(false)
    expect(reachesThirst({ value: 13, cheated: false })).toBe(false)
  })

  it('closes the relic table entirely once one is held', () => {
    expect(thirstStock(3, { held: [] })).toHaveLength(1)
    expect(thirstStock(3, { held: ['medusa'] })).toHaveLength(0)
    // Ordinary equipment does not close it.
    expect(thirstStock(3, { held: ['sword', 'helmet'] })).toHaveLength(1)
  })

  it('opens the whole relic table on a 9 through 13', () => {
    const numbered = THIRST.filter((e) => typeof e.br === 'number')
    expect(thirstOffer(9)).toHaveLength(numbered.length)
    expect(thirstOffer(13)).toHaveLength(numbered.length)
  })

  it("never offers Omen's Mark on a numbered flip", () => {
    for (const v of [1, 5, 8, 9, 13]) {
      expect(thirstOffer(v).some((e) => e.id === 'omens-mark')).toBe(false)
    }
  })
})

/* ── phase 4 ────────────────────────────────────────────────────── */

describe('the experience track', () => {
  it('is three rows of thirteen', () => {
    expect(EXPERIENCE_TRACK).toHaveLength(3)
    for (const row of EXPERIENCE_TRACK) expect(row).toHaveLength(13)
    expect(TOTAL_EXPERIENCE_BOXES).toBe(39)
  })

  /**
   * The book walks its own example on p. 37: Jack's first three boxes are 1, 1
   * and 2, and he may take a tier-2 table on the third. This is the check that
   * caught the previous copy of the track being wrong.
   */
  it('matches the book\'s worked example on the first three boxes', () => {
    expect(EXPERIENCE_BOXES.slice(0, 3)).toEqual([1, 1, 2])
    expect(boxesCrossed(0, 3).map((b) => b.tier)).toEqual([1, 1, 2])
    expect(boxesCrossed(0, 3)[2].tables.map((t) => t.id))
      .toEqual(['attack', 'tactical', 'action', 'ability'])
  })

  it('grants exactly fifteen advancements across the whole track', () => {
    expect(EXPERIENCE_BOXES.filter((n) => n != null)).toHaveLength(15)
  })

  it('treats a tier as a ceiling, not an instruction', () => {
    expect(boxesCrossed(0, 1)[0].tables.map((t) => t.tier)).toEqual([1, 1])
    const tier4 = EXPERIENCE_BOXES.indexOf(4)
    expect(boxesCrossed(tier4, 1)[0].tables.map((t) => t.tier))
      .toEqual([1, 1, 2, 2, 3, 3, 4])
  })

  it('reports blank boxes as experience that bought nothing', () => {
    const blank = boxesCrossed(3, 1)[0]
    expect(tierOfBox(3)).toBe(null)
    expect(blank.grantsAdvancement).toBe(false)
    expect(blank.tables).toEqual([])
  })

  it('stops at the end of the track and does not bank the surplus', () => {
    expect(boxesCrossed(38, 3)).toHaveLength(1)
    expect(experienceWasted(38, 3)).toBe(2)
    expect(trackIsFull(39)).toBe(true)
    expect(trackIsFull(38)).toBe(false)
    expect(boxesCrossed(39, 3)).toHaveLength(0)
  })

  it('resolves boxes in the order they are reached', () => {
    expect(boxesCrossed(0, 3).map((b) => b.boxIndex)).toEqual([0, 1, 2])
  })
})

describe('advancement tables', () => {
  it('offers everything at the flip or lower on an orLower table', () => {
    const attack = findTable('attack')
    const three = offerFor(attack, 3)
    expect(three.every((e) => e.value === ALWAYS || e.value <= 3)).toBe(true)
    expect(offerFor(attack, 13).length).toBeGreaterThan(three.length)
  })

  it('offers exactly one row on an exact table', () => {
    const totem = findTable('totem')
    expect(offerFor(totem, 7).map((e) => e.name)).toEqual(['Chance Taker'])
    // Not "seven or lower" — that would be a strictly better campaign.
    expect(offerFor(totem, 7)).toHaveLength(1)
  })

  it('ignores the flip on a choose table', () => {
    const summoning = findTable('summoning')
    expect(offerFor(summoning, null)).toHaveLength(7)
    expect(offerFor(summoning, 1)).toHaveLength(7)
  })

  it('gives jokers only the rows printed for jokers', () => {
    const attack = findTable('attack')
    const joker = offerFor(attack, 'anyJoker')
    expect(joker.map((e) => e.name)).toEqual(['Cruel Lessons', 'Consult the Bones'])
    const tactical = findTable('tactical')
    expect(offerFor(tactical, 'redJoker').map((e) => e.name)).toEqual(['Illumination of Illios'])
    expect(offerFor(tactical, 'blackJoker').map((e) => e.name)).toEqual(['Darkness of Delios'])
  })

  it('carries a page reference on every entry, since the effects are not stored', () => {
    for (const t of [findTable('attack'), findTable('tactical'), findTable('action'),
      findTable('ability'), findTable('totem'), findTable('summoning')]) {
      for (const e of t.entries) expect(typeof e.page).toBe('number')
    }
  })
})

/* ── phase 5 ────────────────────────────────────────────────────── */

describe('the back-alley doctor', () => {
  it('covers every flip value with exactly one row', () => {
    for (let v = 1; v <= 13; v += 1) expect(doctorResult(v)).not.toBe(null)
    expect(doctorResult('blackJoker').heals).toBe(false)
    expect(doctorResult('redJoker').heals).toBe(true)
  })

  it('does nothing at all on a 1 through 8', () => {
    for (let v = 1; v <= 8; v += 1) expect(doctorOutcome(v).net).toBe('nothing')
  })

  it('trades one injury for another on a nine', () => {
    expect(doctorOutcome(9).net).toBe('traded')
  })

  it('makes things strictly worse on the black joker', () => {
    expect(doctorOutcome('blackJoker').net).toBe('worse')
  })

  it('charges the fee whether or not it works', () => {
    expect(doctorAffordable(1)).toBe(true)
    expect(doctorAffordable(0)).toBe(false)
  })
})

/* ── phase 6 ────────────────────────────────────────────────────── */

describe('injuries', () => {
  it('flips once per model killed, and never for a peon', () => {
    const arsenal = {
      models: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', peon: true },
        { id: 'c', name: 'C' },
      ],
    }
    const flips = modelsToFlipFor({ killedModelIds: ['a', 'b'] }, arsenal)
    expect(flips.map((m) => m.id)).toEqual(['a'])
  })

  it('never flips for a model already out of the arsenal', () => {
    const arsenal = { models: [{ id: 'a', annihilated: true }] }
    expect(modelsToFlipFor({ killedModelIds: ['a'] }, arsenal)).toHaveLength(0)
  })

  it('covers every value in both suit columns', () => {
    for (let v = 1; v <= 13; v += 1) {
      for (const s of ['ram', 'mask', 'crow', 'tome']) {
        expect(injuryResult(v, s)).not.toBe(null)
      }
    }
    expect(INJURY_TABLE.filter((r) => r.value === 'blackJoker')).toHaveLength(1)
    expect(INJURY_TABLE.filter((r) => r.value === 'redJoker')).toHaveLength(1)
  })

  it('reads Rams and Masks as one column and Crows and Tomes as the other', () => {
    expect(injuryResult(3, 'ram').name).toBe('Severe Amputation')
    expect(injuryResult(3, 'mask').name).toBe('Severe Amputation')
    expect(injuryResult(3, 'crow').name).toBe('Distracted by Voices')
    expect(injuryResult(3, 'tome').name).toBe('Distracted by Voices')
  })

  it('attaches nothing on a flesh wound', () => {
    const r = resolveInjuryFlip(1, 'ram', {})
    expect(r.attaches).toBe(false)
    expect(r.name).toBe('Just a Flesh Wound')
  })

  it('throws back a result the model cannot suffer', () => {
    expect(resolveInjuryFlip(6, 'ram', { hasTriggers: false }).reflip).toBe(true)
    expect(resolveInjuryFlip(6, 'ram', { hasTriggers: true }).reflip).toBe(false)
    expect(resolveInjuryFlip(8, 'ram', { hasAttackActions: false }).reflip).toBe(true)
    expect(resolveInjuryFlip(5, 'ram', { isLeader: true }).reflip).toBe(true)
    expect(resolveInjuryFlip('blackJoker', null, { isLeader: true }).reflip).toBe(true)
  })

  it('does not attach or annihilate on a result being thrown back', () => {
    const r = resolveInjuryFlip('blackJoker', null, { isLeader: true })
    expect(r.attaches).toBe(false)
    expect(r.annihilates).toBe(false)
  })

  it('applies nothing when the model already carries that injury', () => {
    const r = resolveInjuryFlip(9, 'ram', { injuryNames: ['Leadfooted'] })
    expect(r.duplicate).toBe(true)
    expect(r.attaches).toBe(false)
    // A duplicate is not a reflip — the flip stands and they simply got lucky.
    expect(r.reflip).toBe(false)
  })

  it('reaches Lucky Miss only on a red joker that was flipped', () => {
    expect(resolveInjuryFlip('redJoker', null, {}, { cheated: false }).luckyMiss).toBe(true)
    expect(resolveInjuryFlip('redJoker', null, {}, { cheated: true }).luckyMiss).toBe(false)
  })

  it('annihilates on Killed Off in either column', () => {
    expect(resolveInjuryFlip(13, 'ram', {}).annihilates).toBe(true)
    expect(resolveInjuryFlip(13, 'tome', {}).annihilates).toBe(true)
  })

  it('covers every Lucky Miss value and gives jokers the Doppelganger', () => {
    for (let v = 1; v <= 13; v += 1) expect(luckyMissResult(v)).not.toBe(null)
    expect(luckyMissResult('redJoker').name).toBe('Doppelganger')
    expect(resolveLuckyMiss(3, { isLeader: true }).reflip).toBe(true)
    expect(resolveLuckyMiss(3, {}).reflip).toBe(false)
  })

  it('annihilates at three injuries and not at two', () => {
    expect(annihilatedAfterInjuries({ a: 2, b: 3, c: 4 })).toEqual(['b', 'c'])
    expect(annihilatedAfterInjuries({ a: 0 })).toEqual([])
  })
})

/**
 * p. 33, on the black joker and on the 9: "flip on the injury chart and reflip
 * any jokers or other results that do not give the model an injury (including
 * being killed off)." Stricter than the injury phase, and simpler: anything
 * that does not attach goes back.
 */
describe("the injury Dr. Mo hands out", () => {
  it('takes a result that attaches', () => {
    const out = resolveDoctorInjury(3, 'ram', {})
    expect(out.name).toBe('Severe Amputation')
    expect(out.attaches).toBe(true)
    expect(out.reflip).toBe(false)
  })

  it('throws back a result that injures nobody', () => {
    const out = resolveDoctorInjury(1, 'ram', {})
    expect(out.name).toBe('Just a Flesh Wound')
    expect(out.reflip).toBe(true)
  })

  /* "including being killed off" — named in the book, so it is named here. */
  it('throws back Killed Off, and never annihilates', () => {
    const out = resolveDoctorInjury(13, 'ram', {})
    expect(out.reflip).toBe(true)
    expect(out.annihilates).toBe(false)
    expect(out.reflipWhy).toContain('killed off')
  })

  it('throws back both jokers and reaches no Lucky Miss', () => {
    const red = resolveDoctorInjury('redJoker', null, {})
    expect(red.reflip).toBe(true)
    expect(red.luckyMiss).toBe(false)
    expect(resolveDoctorInjury('blackJoker', null, {}).reflip).toBe(true)
  })

  /* The per-model conditions fold into the same rule rather than sitting
     beside it: a result the model cannot take does not injure it. */
  it('throws back a result this model cannot take, and says which', () => {
    const out = resolveDoctorInjury(5, 'ram', { isLeader: true })
    expect(out.name).toBe('Headstrong')
    expect(out.reflip).toBe(true)
    expect(out.reflipWhy).toBe('this model is a master or totem')
  })

  it('throws back an injury the model already carries', () => {
    const out = resolveDoctorInjury(3, 'ram', { injuryNames: ['Severe Amputation'] })
    expect(out.reflip).toBe(true)
    expect(out.reflipWhy).toContain('already has')
  })

  it('is null for a value off the table', () => {
    expect(resolveDoctorInjury(null, null, {})).toBeNull()
  })
})

/**
 * p. 36: "After flipping for injuries, ALL models with three or more injury
 * upgrades attached are annihilated" — not only the ones that flipped. The
 * paragraph above it makes the point deliberately, naming a model that gained
 * an injury "in some other manner" and survives until this check.
 */
describe('who the end of phase six carries off', () => {
  const crew = [
    { key: 'm1', name: 'Bo' },
    { key: 'm2', name: 'Cass' },
    { key: 'leader', name: 'The leader', isLeader: true },
  ]
  const counts = { m1: 3, m2: 1, leader: 0 }
  const countFor = (s) => counts[s.key] ?? 0

  it('takes anyone at three injuries, flipped for or not', () => {
    expect(doomedSubjects(crew, countFor).map((s) => s.key)).toEqual(['m1'])
  })

  /* THE REGRESSION THIS EXISTS FOR. Dr. Mo's "Oops?" is the common way to
     reach three without being killed in the game, and the old check only
     looked at models it had flipped for — so that model walked away. */
  it('takes a model the doctor pushed to three, who never flipped', () => {
    const doctored = { m1: 0, m2: 3, leader: 0 }
    expect(doomedSubjects(crew, (s) => doctored[s.key]).map((s) => s.key)).toEqual(['m2'])
  })

  it('takes a Killed Off result even at no injuries', () => {
    expect(doomedSubjects(crew, () => 0, ['m2']).map((s) => s.key)).toEqual(['m2'])
  })

  it('never lists the same subject twice', () => {
    const out = doomedSubjects(crew, countFor, ['m1'])
    expect(out.map((s) => s.key)).toEqual(['m1'])
  })

  it('takes nobody when nobody qualifies', () => {
    expect(doomedSubjects(crew, () => 2)).toEqual([])
    expect(doomedSubjects([], () => 9)).toEqual([])
  })
})
