import { describe, it, expect } from 'vitest'
import {
  startingScrip, hireCost, campaignRating, soulstoneBonus,
  maxEncounterSize, aftermathHandSize, experienceEarned,
  payday, injuryFlipCount, isAnnihilated, AFTERMATH_PHASES,
} from './campaign.js'

describe('startingScrip', () => {
  it('converts unspent stones, capped at three', () => {
    expect(startingScrip(25)).toBe(0)
    expect(startingScrip(23)).toBe(2)
    expect(startingScrip(20)).toBe(3)
    expect(startingScrip(10)).toBe(3)
  })
  it('never goes negative when overspent', () => {
    expect(startingScrip(30)).toBe(0)
  })
})

describe('hireCost', () => {
  const cheap = { cost: 3 }
  const mid = { cost: 7 }

  it('charges the model cost for an ordinary hire', () => {
    expect(hireCost(mid, { isFirstOfWeek: false, outOfKeyword: false })).toBe(7)
  })

  it('adds one for a non-versatile out-of-keyword model', () => {
    expect(hireCost(mid, { isFirstOfWeek: false, outOfKeyword: true, isVersatile: false })).toBe(8)
    expect(hireCost(mid, { isFirstOfWeek: false, outOfKeyword: true, isVersatile: true })).toBe(7)
  })

  it('floors the first hire of the week at zero rather than paying out', () => {
    expect(hireCost(cheap, { isFirstOfWeek: true, outOfKeyword: false })).toBe(0)
  })

  it('lets a group opt into negative results as a house rule', () => {
    expect(hireCost(cheap, { isFirstOfWeek: true, outOfKeyword: false }, { allowNegative: true })).toBe(-2)
  })

  it('changes answer depending on operation order', () => {
    const args = { isFirstOfWeek: true, outOfKeyword: true, isVersatile: false }
    expect(hireCost(cheap, args, { surchargeBeforeDiscount: true, allowNegative: true })).toBe(-1)
    expect(hireCost(cheap, args, { surchargeBeforeDiscount: false })).toBe(1)
  })
})

describe('campaignRating', () => {
  it('matches the worked example from the book', () => {
    expect(campaignRating({ equipmentHired: 2, leaderAdvancements: 2, injuriesInCrew: 1 })).toBe(3)
    expect(campaignRating({ equipmentHired: 0, leaderAdvancements: 1, injuriesInCrew: 3 })).toBe(-2)
  })
})

describe('soulstoneBonus', () => {
  it('gives the difference to the lower-rated crew', () => {
    expect(soulstoneBonus(-1, 1)).toBe(2)
    expect(soulstoneBonus(1, -1)).toBe(0)
  })
  it('caps at three', () => {
    expect(soulstoneBonus(-5, 4)).toBe(3)
  })
})

describe('maxEncounterSize', () => {
  it('uses the smaller arsenal plus six', () => {
    expect(maxEncounterSize(27, 35)).toBe(33)
  })
})

describe('aftermathHandSize', () => {
  it('tops out at four cards', () => {
    expect(aftermathHandSize({ withdrew: false, schemesCompleted: 3 })).toBe(4)
    expect(aftermathHandSize({ withdrew: false, schemesCompleted: 5 })).toBe(4)
  })
  it('drops the completion card on a late withdrawal', () => {
    expect(aftermathHandSize({ withdrew: true, withdrewOnTurn: 4, schemesCompleted: 2 })).toBe(2)
  })
  it('gives no hand at all when withdrawing by turn two', () => {
    expect(aftermathHandSize({ withdrew: true, withdrewOnTurn: 2, schemesCompleted: 3 })).toBe(0)
    expect(aftermathHandSize({ withdrew: true, withdrewOnTurn: 1, schemesCompleted: 0 })).toBe(0)
  })
})

describe('payday', () => {
  it('matches the worked example from the book', () => {
    // Won with 4 VP: 1 scrip for the first 3 VP, 1 for the 4th rounding up,
    // 1 for winning.
    expect(payday({ vp: 4, won: true })).toBe(3)
  })

  it('rounds VP up in blocks of three', () => {
    expect(payday({ vp: 0, won: false })).toBe(0)
    expect(payday({ vp: 1, won: false })).toBe(1)
    expect(payday({ vp: 3, won: false })).toBe(1)
    expect(payday({ vp: 7, won: false })).toBe(3)
  })

  it('pays the rating difference to the lower-rated crew, uncapped', () => {
    expect(payday({ vp: 0, won: false, myRating: -2, opponentRating: 3 })).toBe(5)
    expect(payday({ vp: 0, won: false, myRating: 3, opponentRating: -2 })).toBe(0)
  })

  it('differs from soulstoneBonus, which does cap', () => {
    const args = { myRating: -2, opponentRating: 3 }
    expect(payday({ vp: 0, ...args })).toBe(5)
    expect(soulstoneBonus(args.myRating, args.opponentRating)).toBe(3)
  })

  it('pays nothing when the crew withdrew by turn two', () => {
    expect(payday({ vp: 6, won: true, withdrew: true, withdrewOnTurn: 2 })).toBe(0)
    expect(payday({ vp: 6, won: true, withdrew: true, withdrewOnTurn: 3 })).toBe(3)
  })
})

describe('injuries', () => {
  it('flips once per model killed, not once per model in the crew', () => {
    expect(injuryFlipCount(['a', 'b'])).toBe(2)
    expect(injuryFlipCount([])).toBe(0)
  })
  it('annihilates at three injuries', () => {
    expect(isAnnihilated(2)).toBe(false)
    expect(isAnnihilated(3)).toBe(true)
  })
})

describe('AFTERMATH_PHASES', () => {
  it('is ordered, because the deck is not reshuffled between phases', () => {
    expect(AFTERMATH_PHASES.map((p) => p.id)).toEqual([
      'draw_hand', 'payday', 'barter', 'advance_leader',
      'back_alley_doctor', 'determine_injuries',
    ])
  })
})

describe('experienceEarned', () => {
  it('caps at three and only counts the leader\'s own path', () => {
    expect(experienceEarned({ path: 'bruiser', killedNonPeon: true, interactedNearEnemyDeployment: true, lost: true })).toBe(2)
    expect(experienceEarned({ path: 'strategist', killedNonPeon: true, interactedNearEnemyDeployment: true, lost: true })).toBe(2)
  })
})
