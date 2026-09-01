/**
 * The barter table — Index of the Untold, pp. 22–30.
 *
 * Names, barter ratings, campaign costs and page numbers only. Effect text is
 * book content this app deliberately does not store (CLAUDE.md §4), and unlike
 * model cards there is no live source to fetch it from — BiggerHat's register
 * carries the Malifaux namespace, not campaign-book content. So every entry
 * carries the page it is printed on instead, and the player reads it there.
 *
 * That is not a compromise. Storing the text would make this app the permanent
 * maintainer of a table Wyrd may errata, for the sake of retyping something the
 * player already has open on the table.
 *
 * `br` is the barter rating: a card value, or `ALWAYS` for the four items on
 * permanent offer. `suits` is which suits satisfy that value — a barter flip
 * has to match both, which is why a 7 of Rams cannot buy the 7 of Crows.
 */

/** The suits a barter flip can carry, keyed as the flip records them. */
export const SUITS = {
  ram: 'Rams',
  mask: 'Masks',
  crow: 'Crows',
  tome: 'Tomes',
}

const RM = ['ram', 'mask']
const CT = ['crow', 'tome']

/** Always-available equipment has no suit requirement and no value to match. */
export const ALWAYS = 'always'

export const BARTER = [
  { id: 'lucky-gremlin-foot', name: 'Lucky Gremlin Foot', br: ALWAYS, suits: null, cc: 1, page: 22 },
  { id: 'pistol', name: 'Pistol', br: ALWAYS, suits: null, cc: 1, page: 22 },
  { id: 'sword', name: 'Sword', br: ALWAYS, suits: null, cc: 1, page: 22 },
  { id: 'trusty-rifle', name: 'Trusty Rifle', br: ALWAYS, suits: null, cc: 1, page: 22 },

  { id: 'helmet', name: 'Helmet', br: 1, suits: RM, cc: 2, page: 22 },
  { id: 'healing-salve', name: 'Healing Salve', br: 1, suits: RM, cc: 1, page: 22 },
  { id: 'blackjack', name: 'Blackjack', br: 1, suits: RM, cc: 2, page: 22 },
  { id: 'leg-breaker', name: 'Leg Breaker', br: 1, suits: CT, cc: 2, page: 22 },
  { id: 'warming-flask', name: 'Warming Flask', br: 1, suits: CT, cc: 2, page: 22 },
  { id: 'lead-lined-coat', name: 'Lead-Lined Coat', br: 1, suits: CT, cc: 3, page: 22 },

  { id: 'flamethrower', name: 'Flamethrower', br: 2, suits: RM, cc: 2, page: 22 },
  { id: 'stage-hook', name: 'Stage Hook', br: 2, suits: RM, cc: 2, page: 22 },
  { id: 'guardians-shield', name: 'Guardian’s Shield', br: 2, suits: RM, cc: 2, page: 22 },
  { id: 'death-curse', name: 'Death Curse', br: 2, suits: CT, cc: 2, page: 22 },
  { id: 'twin-katanas', name: 'Twin Katanas', br: 2, suits: CT, cc: 3, page: 23 },
  { id: 'thieves-tools', name: 'Thieves’ Tools', br: 2, suits: CT, cc: 2, page: 23 },

  { id: 'breakable-rope', name: 'Breakable Rope', br: 3, suits: RM, cc: 1, page: 23 },
  { id: 'carrier-pigeon', name: 'Carrier Pigeon', br: 3, suits: RM, cc: 2, page: 23 },
  { id: 'razor-knife', name: 'Razor Knife', br: 3, suits: RM, cc: 2, page: 23 },
  { id: 'vengeful-vow', name: 'Vengeful Vow', br: 3, suits: CT, cc: 2, page: 23 },
  { id: 'aetheric-displacer', name: 'Aetheric Displacer', br: 3, suits: CT, cc: 3, page: 23 },
  { id: 'spiteful-medicine', name: 'Spiteful Medicine', br: 3, suits: CT, cc: 1, page: 23 },

  { id: 'coffee', name: 'Coffee', br: 4, suits: RM, cc: 1, page: 23 },
  { id: 'snipers-scope', name: 'Sniper’s Scope', br: 4, suits: RM, cc: 1, page: 23 },
  { id: 'strange-seed-pod', name: 'Strange Seed Pod', br: 4, suits: RM, cc: 2, page: 23 },
  { id: 'fools-gold', name: 'Fool’s Gold', br: 4, suits: CT, cc: 2, page: 23 },
  { id: 'useless-generator', name: 'Useless Generator', br: 4, suits: CT, cc: 3, page: 24 },
  { id: 'gatling-gun', name: 'Gatling Gun', br: 4, suits: CT, cc: 2, page: 24 },

  { id: 'snake-oil', name: 'Snake Oil', br: 5, suits: RM, cc: 1, page: 24 },
  { id: 'quickdraw-pistol', name: 'Quickdraw Pistol', br: 5, suits: RM, cc: 1, page: 24 },
  { id: 'trekking-poles', name: 'Trekking Poles', br: 5, suits: RM, cc: 1, page: 24 },
  { id: 'assassins-blade', name: 'Assassin’s Blade', br: 5, suits: CT, cc: 2, page: 24 },
  { id: 'two-kids-trench-coat', name: 'Two Kids in a Trench Coat', br: 5, suits: CT, cc: 2, page: 24 },
  { id: 'the-midnight-watch', name: 'The Midnight Watch', br: 5, suits: CT, cc: 1, page: 24 },

  { id: 'whiskey', name: 'Whiskey', br: 6, suits: RM, cc: 1, page: 24 },
  { id: 'clockwork-grenade', name: 'Clockwork Grenade', br: 6, suits: RM, cc: 2, page: 24 },
  { id: 'escape-coil', name: 'Escape Coil', br: 6, suits: RM, cc: 2, page: 24 },
  { id: 'hags-kiss', name: 'Hag’s Kiss', br: 6, suits: CT, cc: 2, page: 24 },
  { id: 'empathic-amplifier', name: 'Empathic Amplifier', br: 6, suits: CT, cc: 2, page: 25 },
  { id: 'tricksters-mask', name: 'Trickster’s Mask', br: 6, suits: CT, cc: 1, page: 25 },

  { id: 'metal-skull-plate', name: 'Metal Skull Plate', br: 7, suits: RM, cc: 3, page: 25 },
  { id: 'barbed-whip', name: 'Barbed Whip', br: 7, suits: RM, cc: 2, page: 25 },
  { id: 'lasso', name: 'Lasso', br: 7, suits: RM, cc: 2, page: 25 },
  { id: 'trash-can', name: 'Trash Can', br: 7, suits: CT, cc: 3, page: 25 },
  { id: 'trash-cant', name: 'Trash Can’t', br: 7, suits: CT, cc: 2, page: 25 },
  { id: 'arcane-sense', name: 'Arcane Sense', br: 7, suits: CT, cc: 1, page: 25 },

  { id: 'back-alley-hydraulics', name: 'Back Alley Hydraulics', br: 8, suits: RM, cc: 1, page: 25 },
  { id: 'book-of-insults', name: 'Book of Insults', br: 8, suits: RM, cc: 1, page: 25 },
  { id: 'cursed-mirror', name: 'Cursed Mirror', br: 8, suits: RM, cc: 1, page: 25 },
  { id: 'bayou-recipe-book', name: 'Bayou Recipe Book', br: 8, suits: CT, cc: 2, page: 25 },
  { id: 'poisoned-noose', name: 'Poisoned Noose', br: 8, suits: CT, cc: 2, page: 26 },
  { id: 'false-face', name: 'False Face', br: 8, suits: CT, cc: 2, page: 26 },

  { id: 'strange-geode', name: 'Strange Geode', br: 9, suits: RM, cc: 2, page: 26 },
  { id: 'unstable-disruptor', name: 'Unstable Disruptor', br: 9, suits: RM, cc: 2, page: 26 },
  { id: 'spinning-scythe', name: 'Spinning Scythe', br: 9, suits: RM, cc: 2, page: 26 },
  { id: 'ominous-cloak', name: 'Ominous Cloak', br: 9, suits: CT, cc: 3, page: 26 },
  { id: 'spyglass', name: 'Spyglass', br: 9, suits: CT, cc: 1, page: 26 },
  { id: 'fools-stone', name: 'Fool’s Stone', br: 9, suits: CT, cc: 3, page: 26 },

  { id: 'mysterious-talisman', name: 'Mysterious Talisman', br: 10, suits: RM, cc: 1, page: 26 },
  { id: 'flash-bang', name: 'Flash Bang', br: 10, suits: RM, cc: 2, page: 27 },
  { id: 'mark-of-authority', name: 'Mark of Authority', br: 10, suits: RM, cc: 2, page: 27 },
  { id: 'crows-foot', name: 'Crow’s Foot', br: 10, suits: CT, cc: 2, page: 27 },
  { id: 'protective-engravings', name: 'Protective Engravings', br: 10, suits: CT, cc: 3, page: 27 },
  { id: 'mutagen-injector', name: 'Mutagen Injector', br: 10, suits: CT, cc: 2, page: 27 },

  { id: 'duelists-rapier', name: 'Duelist’s Rapier', br: 11, suits: RM, cc: 2, page: 27 },
  { id: 'wax-and-feathers', name: 'Wax and Feathers', br: 11, suits: RM, cc: 3, page: 27 },
  { id: 'macuahuitl', name: 'Macuahuitl', br: 11, suits: RM, cc: 2, page: 27 },
  { id: 'quick-draw-holster', name: 'Quick Draw Holster', br: 11, suits: CT, cc: 1, page: 27 },
  { id: 'retractable-spikes', name: 'Retractable Spikes', br: 11, suits: CT, cc: 1, page: 27 },
  { id: 'ancient-scrolls', name: 'Ancient Scrolls', br: 11, suits: CT, cc: 2, page: 27 },

  { id: 'strange-portal', name: 'Strange Portal', br: 12, suits: RM, cc: 1, page: 28 },
  { id: 'badge-of-honor', name: 'Badge of Honor', br: 12, suits: RM, cc: 3, page: 28 },
  { id: 'neverborn-hide', name: 'Neverborn Hide', br: 12, suits: RM, cc: 2, page: 28 },
  { id: 'spectral-blade', name: 'Spectral Blade', br: 12, suits: CT, cc: 2, page: 28 },
  { id: 'giant-pink-sombrero', name: 'Giant Pink Sombrero', br: 12, suits: CT, cc: 3, page: 28 },
  { id: 'duplicator', name: 'Duplicator', br: 12, suits: CT, cc: 2, page: 28 },

  { id: 'relic-hammer', name: 'Relic Hammer', br: 13, suits: RM, cc: 3, page: 28 },
  { id: 'flak-jacket', name: 'Flak Jacket', br: 13, suits: RM, cc: 1, page: 28 },
  { id: 'soul-cage', name: 'Soul Cage', br: 13, suits: RM, cc: 2, page: 28 },
  { id: 'dark-crystal', name: 'Dark Crystal', br: 13, suits: CT, cc: 1, page: 29 },
  { id: 'hurled-luggage', name: 'Hurled Luggage', br: 13, suits: CT, cc: 2, page: 29 },
  { id: 'dead-mans-switch', name: 'Dead Man’s Switch', br: 13, suits: CT, cc: 1, page: 29 },
]

/**
 * Those Who Thirst — pp. 29–30.
 *
 * Reached only by *flipping* the red joker on a barter flip; a cheated red
 * joker counts as a 13 instead. Only reachable while you hold none of these,
 * which is why the offer function takes what you already own.
 *
 * Omen's Mark is the exception on every axis: free, mandatory, and explicitly
 * allowed alongside another Those Who Thirst item.
 */
export const THIRST = [
  { id: 'book-of-the-dead', name: 'The Book of the Dead', br: 1, cc: 3, page: 29 },
  { id: 'judgement', name: 'Judgement', br: 2, cc: 3, page: 30 },
  { id: 'medusa', name: 'Medusa', br: 3, cc: 3, page: 30 },
  { id: 'vicious-thorn', name: 'Vicious Thorn', br: 4, cc: 3, page: 30 },
  { id: 'edict', name: 'Edict', br: 5, cc: 3, page: 30 },
  { id: 'blight', name: 'Blight', br: 6, cc: 3, page: 30 },
  { id: 'insight', name: 'Insight', br: 7, cc: 3, page: 30 },
  { id: 'rigged-fate-deck', name: 'Rigged Fate Deck', br: 8, cc: 1, page: 30 },
  {
    id: 'omens-mark',
    name: 'Omen’s Mark',
    br: 'joker',
    cc: 0,
    page: 30,
    mandatory: true,
    /** Rides alongside a Those Who Thirst item rather than instead of one. */
    besideOthers: true,
  },
]

/** A 9–13 on the Those Who Thirst flip is "choose any of the previous entries". */
export const THIRST_FREE_CHOICE_FROM = 9

const byId = new Map([...BARTER, ...THIRST].map((e) => [e.id, e]))

export function findEquipment(id) {
  return byId.get(id) || null
}

export function isThirst(id) {
  return THIRST.some((e) => e.id === id)
}

/**
 * What a barter flip of this value and suit puts on the counter.
 *
 * Always-available stock is on every flip, deliberately — the book calls that
 * out so a flip is never a wasted phase. `suit` may be null while the player
 * has only entered a value, in which case only the always-available stock
 * shows rather than every suit's worth of it.
 */
export function barterOffer(value, suit) {
  return BARTER.filter((e) => {
    if (e.br === ALWAYS) return true
    if (e.br !== value) return false
    return suit ? e.suits.includes(suit) : false
  })
}

/**
 * Those Who Thirst items a flip of this value offers.
 *
 * 9–13 is a free choice from everything above it. Omen's Mark is never offered
 * by a numbered flip — it arrives on a joker — so it is filtered out of both
 * branches rather than leaking into the 9–13 choice.
 */
export function thirstOffer(value) {
  if (value == null) return []
  const numbered = THIRST.filter((e) => typeof e.br === 'number')
  if (value >= THIRST_FREE_CHOICE_FROM) return numbered
  return numbered.filter((e) => e.br === value)
}
