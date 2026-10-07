/**
 * Gaining Grounds One: which strategies and schemes are in the current season.
 *
 * Names and suits only. The list is from Wyrd's free Gaining Grounds One
 * document (p. 6), and the suits and slugs are BiggerHat's, which tags each
 * strategy and scheme with its season. The *text* of each is read live from
 * BiggerHat and never stored (`rules.js`, §4): owner decision, Session 78 —
 * the document is free to use, and reading it live means a revision or the
 * next season reaches the app without anyone retyping it. These names are what
 * keep setup working offline when the text cannot be read.
 *
 * Two strategies carry no suit. The core rules say the attacker flipping a
 * joker "may" have special results "depending on the current Gaining
 * Grounds", and Gaining Grounds One does not say which is which, so a joker
 * offers both and the players pick.
 */

export const SEASON = { id: 'gaining_grounds_1', name: 'Gaining Grounds One' }

export const SUITS = ['ram', 'crow', 'tome', 'mask']
export const SUIT_NAMES = { ram: 'Ram', crow: 'Crow', tome: 'Tome', mask: 'Mask', joker: 'Joker' }

export const STRATEGIES = [
  { slug: 'turf-war', name: 'Turf War', suit: 'ram' },
  { slug: 'head-hunter', name: 'Head Hunter', suit: 'crow' },
  { slug: 'map-the-area', name: 'Map the Area', suit: 'tome' },
  { slug: 'stuff-the-ballots', name: 'Stuff the Ballots', suit: 'mask' },
  { slug: 'greased-pigs', name: 'Greased Pigs', suit: null },
  { slug: 'aetheric-conduit', name: 'Aetheric Conduit', suit: null },
]

export const SCHEMES = [
  { slug: 'take-the-high-ground', name: 'Take the High Ground' },
  { slug: 'supply-cache', name: 'Supply Cache' },
  { slug: 'reshape-the-land', name: 'Reshape the Land' },
  { slug: 'make-it-look-like-an-accident', name: 'Make It Look Like An Accident' },
  { slug: 'leave-your-mark', name: 'Leave Your Mark' },
  { slug: 'organ-retrieval', name: 'Organ Retrieval' },
  { slug: 'lay-the-bait', name: 'Lay The Bait' },
  { slug: 'breakthrough', name: 'Breakthrough' },
  { slug: 'make-sure-theyre-not-found', name: 'Make Sure They’re Not Found' },
  { slug: 'pure-spite', name: 'Pure Spite' },
  { slug: 'watch-them-burn', name: 'Watch Them Burn' },
  { slug: 'caught-red-handed', name: 'Caught Red-Handed' },
  { slug: 'reconnaissance', name: 'Reconnaissance' },
  { slug: 'runic-binding', name: 'Runic Binding' },
  { slug: 'public-demonstration', name: 'Public Demonstration' },
  { slug: 'stake-a-claim', name: 'Stake A Claim' },
  { slug: 'frame-job', name: 'Frame Job' },
  { slug: 'plant-evidence', name: 'Plant Evidence' },
  { slug: 'undercover-agent', name: 'Undercover Agent' },
  { slug: 'get-the-drop-on-em', name: 'Get The Drop On ’Em' },
  { slug: 'awaken-power', name: 'Awaken Power' },
]

/**
 * Deployment, by the suit of the defender's flip. The suit for each is the
 * glyph printed beside it in the core rules' Choose Deployment step. The
 * description is the zone's geometry in a line, which is a fact about the
 * table rather than rules text.
 */
export const DEPLOYMENTS = [
  { id: 'standard', name: 'Standard Deployment', suit: 'ram', zone: 'Within 8" of a chosen table edge; the opponent within 8" of the opposite edge.' },
  { id: 'corner', name: 'Corner Deployment', suit: 'crow', zone: 'Within 12" of a chosen table corner; the opponent within 12" of the opposite corner.' },
  { id: 'flank', name: 'Flank Deployment', suit: 'tome', zone: 'Within 9" of the table edges of a chosen table quarter; the opponent in the opposite quarter.' },
  { id: 'wedge', name: 'Wedge Deployment', suit: 'mask', zone: 'A wedge from 12" along the centre of a table edge back to the corners; the opponent opposite.' },
]
