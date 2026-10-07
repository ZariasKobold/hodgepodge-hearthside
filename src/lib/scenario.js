/**
 * Encounter setup, steps A to K of the core rules, as the campaign changes it.
 *
 * Pure (§6). The screen is `components/crew/EncounterSetup.jsx`. Owner request,
 * Session 78: the Play tab should walk setup the way the rules lay it out.
 *
 * What the campaign changes (Index of the Untold, p. 19 — "If a step is not
 * listed, it is not changed"):
 *
 * - **Encounter size** is capped by the smaller arsenal plus six.
 * - **Faction and leader** are the ones declared for the campaign. Nothing to
 *   choose, so the step only shows them.
 * - **Hiring** is only from the current arsenal; leader and totem are free.
 * - **Campaign rating** is a new step after revealing crews.
 *
 * The app owns no fate deck, here as in the aftermath. Every flip is made on
 * the table and its suit typed in. Drawing three schemes is the one thing it
 * will do for the players, because the scheme cards are a separate deck many
 * players do not own, and the rules point at Wyrd's own app for exactly that.
 */

import { STRATEGIES, SCHEMES, DEPLOYMENTS } from '../data/gainingGrounds.js'

/** The steps, in order. `campaign` marks the one the campaign adds. */
export const SETUP_STEPS = [
  { id: 'size', letter: 'A', name: 'Encounter size' },
  { id: 'terrain', letter: 'B', name: 'Terrain' },
  { id: 'scenario', letter: 'C', name: 'Scenario' },
  { id: 'schemes', letter: 'D', name: 'Generate schemes' },
  { id: 'deployment', letter: 'E', name: 'Choose deployment' },
  { id: 'leader', letter: 'F', name: 'Faction and leader' },
  { id: 'hire', letter: 'G', name: 'Hire crew' },
  { id: 'reveal', letter: 'H', name: 'Reveal crews' },
  { id: 'rating', letter: '+', name: 'Campaign rating', campaign: true },
  { id: 'deploy', letter: 'I', name: 'Deployment' },
  { id: 'scheme', letter: 'J', name: 'Choose scheme' },
  { id: 'start', letter: 'K', name: 'Start of game' },
]

export const SCHEME_POOL_SIZE = 3

export function createSetup(patch = {}) {
  return {
    step: 'size',
    terrainDone: false,
    /** 'me' | 'them' | null — who flipped higher. */
    attacker: null,
    /** The attacker's flip: a suit, or 'joker'. */
    strategySuit: null,
    strategy: null,           // slug
    /** The defender's flip. Jokers are reflipped, so never 'joker'. */
    deploymentSuit: null,
    /** Slugs of the three schemes available to both players. */
    schemePool: [],
    deploymentChosen: false,
    revealed: false,
    deployed: false,
    /** Slug. Secret: it is on this player's own document and goes nowhere else. */
    scheme: null,
    ...patch,
  }
}

export const stepIndex = (id) => SETUP_STEPS.findIndex((s) => s.id === id)

export function nextStep(id) {
  const i = stepIndex(id)
  return i >= 0 && i < SETUP_STEPS.length - 1 ? SETUP_STEPS[i + 1].id : null
}

export function previousStep(id) {
  const i = stepIndex(id)
  return i > 0 ? SETUP_STEPS[i - 1].id : null
}

/** The strategies a flip of this suit gives the attacker. A joker offers the suitless ones. */
export function strategiesForSuit(suit) {
  if (!suit) return []
  if (suit === 'joker') return STRATEGIES.filter((s) => !s.suit)
  return STRATEGIES.filter((s) => s.suit === suit)
}

/** Choosing the attacker's suit settles the strategy when only one fits. */
export function strategySuitPatch(suit) {
  const options = strategiesForSuit(suit)
  return { strategySuit: suit, strategy: options.length === 1 ? options[0].slug : null }
}

export function deploymentForSuit(suit) {
  return DEPLOYMENTS.find((d) => d.suit === suit) || null
}

export const strategyBySlug = (slug) => STRATEGIES.find((s) => s.slug === slug) || null
export const schemeBySlug = (slug) => SCHEMES.find((s) => s.slug === slug) || null

/**
 * Add or remove one scheme from the pool, by hand, as the attacker flips
 * them. Never more than three; a scheme the player had chosen leaves with it.
 */
export function toggleSchemeInPool(setup, slug) {
  const pool = setup.schemePool || []
  if (pool.includes(slug)) {
    return { schemePool: pool.filter((s) => s !== slug), scheme: setup.scheme === slug ? null : setup.scheme }
  }
  if (pool.length >= SCHEME_POOL_SIZE) return {}
  return { schemePool: [...pool, slug] }
}

/** Three different schemes, at random. `random` is injectable for tests. */
export function drawSchemePool(random = Math.random) {
  const deck = SCHEMES.map((s) => s.slug)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return { schemePool: deck.slice(0, SCHEME_POOL_SIZE), scheme: null }
}

/** The chosen scheme must be one of the pool. */
export function chooseScheme(setup, slug) {
  return (setup.schemePool || []).includes(slug) ? { scheme: slug } : {}
}

/**
 * Is each step done? Only what can be known is judged; a step that is a
 * conversation at the table (terrain, deployment) is done when ticked.
 * `hireReady` comes from `encounterReady`, which already knows the crew.
 */
export function stepsDone(setup, { sizeKnown = false, hireReady = false, ratingKnown = false } = {}) {
  const s = setup || createSetup()
  return {
    size: sizeKnown,
    terrain: Boolean(s.terrainDone),
    scenario: Boolean(s.attacker && s.strategy && s.deploymentSuit),
    schemes: (s.schemePool || []).length === SCHEME_POOL_SIZE,
    deployment: Boolean(s.deploymentChosen),
    leader: true,
    hire: hireReady,
    reveal: Boolean(s.revealed),
    rating: ratingKnown,
    deploy: Boolean(s.deployed),
    scheme: Boolean(s.scheme),
    start: false,
  }
}

/** The steps still open before the game can start, by name. */
export function setupGaps(setup, facts) {
  const done = stepsDone(setup, facts)
  return SETUP_STEPS.filter((s) => s.id !== 'start' && !done[s.id])
}
