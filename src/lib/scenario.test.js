import { describe, it, expect } from 'vitest'
import {
  SETUP_STEPS, createSetup, nextStep, previousStep, strategiesForSuit, strategySuitPatch,
  deploymentForSuit, toggleSchemeInPool, drawSchemePool, chooseScheme, stepsDone, setupGaps,
  SCHEME_POOL_SIZE,
} from './scenario.js'
import { STRATEGIES, SCHEMES, DEPLOYMENTS } from '../data/gainingGrounds.js'

describe('the data, against Gaining Grounds One', () => {
  it('lists the six strategies and twenty-one schemes on p. 6', () => {
    expect(STRATEGIES).toHaveLength(6)
    expect(SCHEMES).toHaveLength(21)
    expect(new Set(SCHEMES.map((s) => s.slug)).size).toBe(21)
  })

  it('gives each suit exactly one strategy and one deployment', () => {
    for (const suit of ['ram', 'crow', 'tome', 'mask']) {
      expect(strategiesForSuit(suit)).toHaveLength(1)
      expect(deploymentForSuit(suit)).not.toBeNull()
    }
    expect(DEPLOYMENTS).toHaveLength(4)
  })
})

describe('the steps', () => {
  it('runs A to K with the campaign rating after the reveal (p. 19)', () => {
    expect(SETUP_STEPS.map((s) => s.letter).join('')).toBe('ABCDEFGH+IJK')
    expect(nextStep('reveal')).toBe('rating')
    expect(nextStep('rating')).toBe('deploy')
    expect(nextStep('start')).toBeNull()
    expect(previousStep('size')).toBeNull()
    expect(previousStep('terrain')).toBe('size')
  })
})

describe('the scenario (step C)', () => {
  it('settles the strategy from a suit', () => {
    expect(strategySuitPatch('crow')).toEqual({ strategySuit: 'crow', strategy: 'head-hunter' })
    expect(deploymentForSuit('ram').id).toBe('standard')
    expect(deploymentForSuit('mask').id).toBe('wedge')
  })

  it('leaves a joker for the players to choose between the suitless two', () => {
    expect(strategiesForSuit('joker').map((s) => s.slug)).toEqual(['greased-pigs', 'aetheric-conduit'])
    expect(strategySuitPatch('joker').strategy).toBeNull()
    expect(strategiesForSuit(null)).toEqual([])
  })
})

describe('the scheme pool (steps D and J)', () => {
  it('takes three by hand and no more, and drops a chosen scheme that leaves', () => {
    let s = createSetup()
    for (const slug of ['breakthrough', 'frame-job', 'pure-spite', 'lay-the-bait']) {
      s = { ...s, ...toggleSchemeInPool(s, slug) }
    }
    expect(s.schemePool).toEqual(['breakthrough', 'frame-job', 'pure-spite'])
    s = { ...s, ...chooseScheme(s, 'frame-job') }
    expect(s.scheme).toBe('frame-job')
    s = { ...s, ...toggleSchemeInPool(s, 'frame-job') }
    expect(s.scheme).toBeNull()
  })

  it('draws three different schemes and clears an old choice', () => {
    let n = 0
    const fake = () => ((n++ * 0.37) % 1)
    const drawn = drawSchemePool(fake)
    expect(drawn.schemePool).toHaveLength(SCHEME_POOL_SIZE)
    expect(new Set(drawn.schemePool).size).toBe(SCHEME_POOL_SIZE)
    expect(drawn.scheme).toBeNull()
  })

  it('refuses a scheme that is not in the pool', () => {
    expect(chooseScheme(createSetup({ schemePool: ['frame-job'] }), 'breakthrough')).toEqual({})
  })
})

describe('what is left before the game', () => {
  it('names every open step, and nothing once all is done', () => {
    expect(setupGaps(createSetup()).map((s) => s.id))
      .toEqual(['size', 'terrain', 'scenario', 'schemes', 'deployment', 'hire', 'reveal', 'rating', 'deploy', 'scheme'])
    const done = createSetup({
      terrainDone: true, attacker: 'me', strategy: 'turf-war', strategySuit: 'ram', deploymentSuit: 'crow',
      schemePool: ['a', 'b', 'c'], deploymentChosen: true, revealed: true, deployed: true, scheme: 'a',
    })
    expect(setupGaps(done, { sizeKnown: true, hireReady: true, ratingKnown: true })).toEqual([])
    expect(stepsDone(done).leader).toBe(true)
  })
})
