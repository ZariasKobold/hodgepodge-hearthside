/**
 * Leader advancement — Index of the Untold, pp. 31 and 38–55.
 *
 * Names, flip values, types and page numbers. No effect text, for the reason
 * `equipment.js` gives at length: it is book content this app does not store
 * (CLAUDE.md §4), and there is no live source to fetch it from. Every entry
 * carries its printed page instead.
 *
 * The three shapes of table matter more than the entries, because they decide
 * what the flow may offer:
 *
 *   `orLower` — flip, then choose any entry at that value **or lower**.
 *   `exact`   — flip, then choose an entry matching that value exactly.
 *   `choose`  — no flip at all; the pick is yours.
 *
 * Getting that wrong is the kind of mistake nobody notices: offering the whole
 * totem table on a 12 rather than the one totem printed at 12 is a strictly
 * better campaign than the book's, quietly.
 */

/**
 * The leadership experience track, as printed on the arsenal sheet (p. 31).
 *
 * Three rows of thirteen. A number in a box grants an advancement from a table
 * of that tier **or lower**; a blank box is experience that buys nothing yet.
 * Boxes fill left to right, row by row, and once a box's advancement is chosen
 * there is no going back.
 *
 * Read off the printed track's glyph positions rather than transcribed, and
 * cross-checked against the book's own worked example on p. 37 — Jack's first
 * three boxes are 1, 1, 2. The previous copy of this table in `ArsenalSheet`
 * had rows two and three wrong, which is why it now lives in exactly one file.
 */
export const EXPERIENCE_TRACK = [
  [1, 1, 2, null, 3, null, 4, null, 1, null, 2, null, 4],
  [null, null, null, 1, null, null, 2, 1, null, null, null, 3, null],
  [null, null, null, 1, null, null, null, null, 2, null, null, null, 4],
]

/** Every box on the track, flattened, so "the nth box" is a single index. */
export const EXPERIENCE_BOXES = EXPERIENCE_TRACK.flat()

/** A cheated or flipped joker, in the value slot. */
export const ANY_JOKER = 'anyJoker'
export const RED_JOKER = 'redJoker'
export const BLACK_JOKER = 'blackJoker'
export const ALWAYS = 'always'

const T = 'Trigger'
const SKL = 'Skl'
const SIG = 'Signature'

/* ── Tier 1 ─────────────────────────────────────────────────────── */

const ATTACK = [
  { value: 1, type: T, suit: 'crow', name: 'Dismember', page: 38 },
  { value: 1, type: T, suit: 'mask', name: 'Ripped to Shreds', page: 38 },
  { value: 1, type: T, suit: 'ram', name: 'Drink Blood', page: 38 },
  { value: 1, type: T, suit: 'tome', name: 'Analyze Weakness', page: 38 },
  { value: 1, type: T, suit: 'soulstone', name: 'Heavy Fall', page: 38 },

  { value: 2, type: T, suit: 'crow', name: 'Finality', page: 38 },
  { value: 2, type: T, suit: 'mask', name: 'Advance', page: 38 },
  { value: 2, type: T, suit: 'ram', name: 'And Stay There!', page: 38 },
  { value: 2, type: T, suit: 'tome', name: 'Marked', page: 38 },

  { value: 3, type: T, suit: 'crow', name: 'Convulsions', page: 38 },
  { value: 3, type: T, suit: 'mask', name: 'Bowled Over', page: 38 },
  { value: 3, type: T, suit: 'ram', name: 'Collision', page: 38 },
  { value: 3, type: T, suit: 'tome', name: 'Arcane Jolt', page: 38 },

  { value: 4, type: T, suit: 'crow', name: 'Delay', page: 38 },
  { value: 4, type: T, suit: 'mask', name: 'Confusing Feelings', page: 38 },
  { value: 4, type: T, suit: 'ram', name: 'Defensive Reflexes', page: 38 },
  { value: 4, type: T, suit: 'tome', name: 'Auto-Repair', page: 38 },

  { value: 5, type: T, suit: 'crow', name: 'Infect', page: 38 },
  { value: 5, type: T, suit: 'mask', name: 'Reposition', page: 38 },
  { value: 5, type: T, suit: 'ram', name: 'Dumbfounded', page: 38 },
  { value: 5, type: T, suit: 'tome', name: 'Beautiful Clothes', page: 38 },

  { value: 6, type: T, suit: 'crow', name: 'Drain Magic', page: 39 },
  { value: 6, type: T, suit: 'mask', name: 'Follow My Path', page: 39 },
  { value: 6, type: T, suit: 'ram', name: 'Eyes Peeled', page: 39 },
  { value: 6, type: T, suit: 'tome', name: 'Buffeted by Wind', page: 39 },

  { value: 7, type: T, suit: 'crow', name: 'Draw Their Attention', page: 39 },
  { value: 7, type: T, suit: 'mask', name: 'Four-Leafed Clover', page: 39 },
  { value: 7, type: T, suit: 'ram', name: 'Finisher', page: 39 },
  { value: 7, type: T, suit: 'tome', name: 'Field Kit', page: 39 },
  { value: 7, type: SKL, suit: null, name: 'Skill Boost', page: 39 },

  { value: 8, type: T, suit: 'crow', name: 'Blank Stare', page: 39 },
  { value: 8, type: T, suit: 'mask', name: 'Aggressive Interrogation', page: 39 },
  { value: 8, type: T, suit: 'ram', name: 'Flaming Aura', page: 39 },
  { value: 8, type: T, suit: 'tome', name: 'Drink Up', page: 39 },

  { value: 9, type: T, suit: 'crow', name: 'Forgetful', page: 39 },
  { value: 9, type: T, suit: 'mask', name: 'Mass Hysteria', page: 39 },
  { value: 9, type: T, suit: 'ram', name: 'Always Eating', page: 39 },
  { value: 9, type: T, suit: 'tome', name: 'Draw Out Secrets', page: 39 },

  { value: 10, type: T, suit: 'crow', name: '“AHHH, MY EYE!”', page: 39 },
  { value: 10, type: T, suit: 'mask', name: 'Precise Strike', page: 39 },
  { value: 10, type: T, suit: 'ram', name: 'Heave', page: 39 },
  { value: 10, type: T, suit: 'tome', name: 'Wildly Flailing', page: 40 },
  { value: 10, type: SKL, suit: null, name: 'Skill Boost', page: 40 },

  { value: 11, type: T, suit: 'crow', name: 'Loss for Words', page: 40 },
  { value: 11, type: T, suit: 'mask', name: 'On Your Heels', page: 40 },
  { value: 11, type: T, suit: 'ram', name: 'Critical Strike', page: 40 },
  { value: 11, type: T, suit: 'tome', name: 'Snail’s Pace', page: 40 },

  { value: 12, type: T, suit: 'crow', name: 'Maim', page: 40 },
  { value: 12, type: T, suit: 'mask', name: 'Accidental Roll Over', page: 40 },
  { value: 12, type: T, suit: 'ram', name: 'Pull and Drag', page: 40 },
  { value: 12, type: T, suit: 'tome', name: 'Sweeping Strike', page: 40 },
  { value: 12, type: SKL, suit: null, name: 'Skill Boost', page: 40 },

  { value: 13, type: T, suit: 'crow', name: 'Tactical Advantage', page: 40 },
  { value: 13, type: T, suit: 'mask', name: 'Cruelty', page: 40 },
  { value: 13, type: T, suit: 'ram', name: 'Pump Action', page: 40 },
  { value: 13, type: T, suit: 'tome', name: 'Arc', page: 40 },
  { value: 13, type: T, suit: 'soulstone', name: 'Wild Toss', page: 40 },
  { value: 13, type: SIG, suit: null, name: 'Attack Signature', page: 40 },

  { value: ANY_JOKER, type: T, suit: 'soulstone', name: 'Cruel Lessons', page: 40 },
  { value: ANY_JOKER, type: T, suit: 'soulstone', name: 'Consult the Bones', page: 40 },
]

const TACTICAL = [
  { value: 1, type: T, suit: 'crow', name: 'Eau de Bayou', page: 41 },
  { value: 1, type: T, suit: 'mask', name: '“Hey, It Worked!”', page: 41 },
  { value: 1, type: T, suit: 'ram', name: 'Fix it!', page: 41 },
  { value: 1, type: T, suit: 'tome', name: '“Fuuuuture!”', page: 41 },
  { value: 1, type: T, suit: 'crow', name: 'Revelation', page: 41 },
  { value: 1, type: T, suit: 'mask', name: 'Hidden Rope', page: 41 },
  { value: 1, type: T, suit: 'ram', name: 'Iron Resolve', page: 41 },
  { value: 1, type: T, suit: 'tome', name: 'Price of Knowledge', page: 41 },
  { value: 1, type: T, suit: 'soulstone', name: 'Resourceful', page: 41 },

  { value: 2, type: T, suit: 'crow', name: 'Hasten', page: 41 },
  { value: 2, type: T, suit: 'mask', name: '“I’ve Got Your Back!”', page: 41 },
  { value: 2, type: T, suit: 'ram', name: 'Lethal Aura', page: 41 },
  { value: 2, type: T, suit: 'tome', name: 'Inner Peace', page: 41 },

  { value: 3, type: T, suit: 'crow', name: 'I Can Dig It', page: 41 },
  { value: 3, type: T, suit: 'mask', name: 'Advance', page: 41 },
  { value: 3, type: T, suit: 'ram', name: 'Mend', page: 41 },
  { value: 3, type: T, suit: 'tome', name: 'Preparations', page: 41 },

  { value: 4, type: T, suit: 'crow', name: 'Rot Away', page: 41 },
  { value: 4, type: T, suit: 'mask', name: 'Reposition', page: 41 },
  { value: 4, type: T, suit: 'ram', name: 'Pull and Drag', page: 41 },
  { value: 4, type: T, suit: 'tome', name: 'Purification', page: 41 },

  { value: 5, type: T, suit: 'crow', name: 'Perilous Ground', page: 41 },
  { value: 5, type: T, suit: 'mask', name: 'Herd the Pack', page: 42 },
  { value: 5, type: T, suit: 'ram', name: 'Take a Bow', page: 42 },
  { value: 5, type: T, suit: 'tome', name: 'Fortify', page: 42 },

  { value: 6, type: T, suit: 'crow', name: 'Unnatural Vigor', page: 42 },
  { value: 6, type: T, suit: 'mask', name: 'Four-Leafed Clover', page: 42 },
  { value: 6, type: T, suit: 'ram', name: 'Eyes Peeled', page: 42 },
  { value: 6, type: T, suit: 'tome', name: 'Visions of Glamour', page: 42 },

  { value: 7, type: T, suit: 'crow', name: 'Without Warning', page: 42 },
  { value: 7, type: T, suit: 'mask', name: 'Keep Your Distance', page: 42 },
  { value: 7, type: T, suit: 'ram', name: 'Shrug Off', page: 42 },
  { value: 7, type: T, suit: 'tome', name: 'Survival Skills', page: 42 },
  { value: 7, type: SKL, suit: null, name: 'Skill Boost', page: 42 },

  { value: 8, type: T, suit: 'crow', name: 'Wolf Down', page: 42 },
  { value: 8, type: T, suit: 'mask', name: 'Pulled Here and There', page: 42 },
  { value: 8, type: T, suit: 'ram', name: 'Full Steam', page: 42 },
  { value: 8, type: T, suit: 'tome', name: 'Catch a Glimpse', page: 42 },

  { value: 9, type: T, suit: 'crow', name: 'Spiked Coffee', page: 42 },
  { value: 9, type: T, suit: 'mask', name: 'Quick Reflexes', page: 42 },
  { value: 9, type: T, suit: 'ram', name: 'Show of Force', page: 42 },
  { value: 9, type: T, suit: 'tome', name: 'Maneuver', page: 42 },

  { value: 10, type: T, suit: 'crow', name: 'Quicksand', page: 42 },
  { value: 10, type: T, suit: 'mask', name: 'Erase Their Legacy', page: 43 },
  { value: 10, type: T, suit: 'ram', name: 'Focused Cleansing', page: 43 },
  { value: 10, type: T, suit: 'tome', name: 'Enchant', page: 43 },

  { value: 11, type: T, suit: 'crow', name: 'Soulfire', page: 43 },
  { value: 11, type: T, suit: 'mask', name: 'Never Tell Me the Odds', page: 43 },
  { value: 11, type: T, suit: 'ram', name: 'Secret Beneath the Rib', page: 43 },
  { value: 11, type: T, suit: 'tome', name: 'Forethought', page: 43 },

  { value: 12, type: T, suit: 'crow', name: 'Prioritize', page: 43 },
  { value: 12, type: T, suit: 'mask', name: 'Vanish', page: 43 },
  { value: 12, type: T, suit: 'ram', name: 'Retrace Steps', page: 43 },
  { value: 12, type: T, suit: 'tome', name: 'Pass Through', page: 43 },
  { value: 12, type: SKL, suit: null, name: 'Skill Boost', page: 43 },

  { value: 13, type: T, suit: 'crow', name: '“Looks Edible?”', page: 43 },
  { value: 13, type: T, suit: 'mask', name: 'Coordinated Attack', page: 43 },
  { value: 13, type: T, suit: 'ram', name: 'Overwhelming Aggression', page: 43 },
  { value: 13, type: T, suit: 'tome', name: 'Swap Stories', page: 43 },
  { value: 13, type: T, suit: 'soulstone', name: 'Blood for Power', page: 43 },
  { value: 13, type: SIG, suit: null, name: 'Tactical Signature', page: 43 },

  { value: RED_JOKER, type: T, suit: 'soulstone', name: 'Illumination of Illios', page: 43 },
  { value: BLACK_JOKER, type: T, suit: 'soulstone', name: 'Darkness of Delios', page: 43 },
]

/* ── Tier 2 ─────────────────────────────────────────────────────── */

const ACTION = [
  { value: ALWAYS, name: 'Tap the Leyline', page: 44 },
  { value: ALWAYS, name: 'Healing Energy', page: 44 },

  { value: 1, name: 'Throw ’Em a Bone', page: 44 },
  { value: 1, name: 'Ice Blast', page: 44 },
  { value: 1, name: 'Hand Cannon', page: 44 },
  { value: 1, name: 'Spirit Slap', page: 44 },

  { value: 2, name: 'Defensive Energy', page: 44 },
  { value: 2, name: 'Drunken Dash', page: 44 },
  { value: 2, name: 'Lightning Strike', page: 44 },
  { value: 2, name: 'Zipp Zapp', page: 44 },
  { value: 2, name: 'Smashed Bottle', page: 44 },

  { value: 3, name: 'Secret Passage', page: 44 },
  { value: 3, name: 'False Claim', page: 45 },
  { value: 3, name: 'Bored to Death', page: 45 },
  { value: 3, name: 'Shuriken', page: 45 },
  { value: 3, name: 'Burn Stick', page: 45 },

  { value: 4, name: 'Lifting Spirits', page: 45 },
  { value: 4, name: 'Retrofit', page: 45 },
  { value: 4, name: 'Hellfire Shot', page: 45 },
  { value: 4, name: 'Alchemical Vial', page: 45 },
  { value: 4, name: 'Knock Heads', page: 45 },

  { value: 5, name: 'Leap', page: 45 },
  { value: 5, name: 'Obscene Feast', page: 45 },
  { value: 5, name: 'Avalanche', page: 45 },
  { value: 5, name: 'Compact Shotgun', page: 45 },
  { value: 5, name: 'Tangling Roots', page: 45 },

  { value: 6, name: 'Supportive Measures', page: 46 },
  { value: 6, name: 'Revitalize', page: 46 },
  { value: 6, name: 'Covert Agent', page: 46 },
  { value: 6, name: 'Bone Javelin', page: 46 },
  { value: 6, name: 'Resupply', page: 46 },

  { value: 7, name: 'Fade Into Memory', page: 46 },
  { value: 7, name: 'Steamroller', page: 46 },
  { value: 7, name: 'Contract Kill', page: 46 },
  { value: 7, name: 'Flare Gun', page: 46 },
  { value: 7, name: 'Fishin’ Gear', page: 46 },

  { value: 8, name: 'Nitro Boost', page: 46 },
  { value: 8, name: 'Falling Skies', page: 46 },
  { value: 8, name: 'Spilling Secrets', page: 47 },
  { value: 8, name: 'Giant’s Bane', page: 47 },
  { value: 8, name: 'Dynamite Punch', page: 47 },

  { value: 9, name: 'Unstable Ground', page: 47 },
  { value: 9, name: '50ft of Silk Rope', page: 47 },
  { value: 9, name: 'Breath of Fire', page: 47 },
  { value: 9, name: 'Netgun', page: 47 },
  { value: 9, name: 'Balanced Sword', page: 47 },

  { value: 10, name: 'A Cage for All', page: 47 },
  { value: 10, name: 'Cleansing Shield', page: 47 },
  { value: 10, name: 'Whip Vault', page: 47 },
  { value: 10, name: 'Mortar Strike', page: 47 },
  { value: 10, name: 'Absolute Control', page: 48 },
  { value: 10, name: 'Outmaneuver', page: 48 },
  { value: 10, name: 'Intuition', page: 48 },
  { value: 10, name: 'Frightening Reminder', page: 48 },
  { value: 10, name: '“Objection!”', page: 48 },
  { value: 10, name: 'Chesterfield Shotgun', page: 48 },
  { value: 10, name: '“Up We Go!”', page: 48 },

  { value: 11, name: 'Turn a Profit', page: 48 },
  { value: 11, name: 'Raging Bellow', page: 48 },
  { value: 11, name: 'Mirrored Malice', page: 48 },
  { value: 11, name: 'Ansatsu Rifle', page: 48 },
  { value: 11, name: 'Runic Blade', page: 48 },

  { value: 12, name: 'Fallow Night', page: 49 },
  { value: 12, name: 'Blast to Bits', page: 49 },
  { value: 12, name: 'Sundering', page: 49 },
  { value: 12, name: 'Clockwork Seeker', page: 49 },
  { value: 12, name: 'Mind Barbs', page: 49 },

  { value: 13, name: 'Obey', page: 49 },
  { value: 13, name: 'Expanding Influence', page: 49 },
  { value: 13, name: 'Onward', page: 49 },
  { value: 13, name: 'Dark Bargain', page: 49 },
  { value: 13, name: 'Broken Illusions', page: 49 },
  { value: 13, name: 'Long Carbine', page: 49 },

  {
    value: ANY_JOKER, name: 'Choose', page: 49,
    /** A flipped joker takes any action off a real model; a cheated one reads
        as its own value instead, which is why this cannot be auto-resolved. */
    freeChoice: true,
  },
]

const ABILITY = [
  { value: ALWAYS, name: 'Escape Path', page: 50 },
  { value: ALWAYS, name: 'Double Tap', page: 50 },
  { value: ALWAYS, name: 'Ethereal Protection', page: 50 },

  { value: 1, name: 'Ruthless', page: 50 },
  { value: 1, name: 'Evasive', page: 50 },
  { value: 2, name: 'Nose for Decay', page: 50 },
  { value: 2, name: 'Trample', page: 50 },
  { value: 3, name: 'Amplify Power', page: 50 },
  { value: 3, name: 'Ungentlemanly Affairs', page: 50 },
  { value: 4, name: 'Fun Prizes', page: 50 },
  { value: 4, name: 'Construct Savant', page: 50 },
  { value: 5, name: 'Shouting Orders', page: 50 },
  { value: 5, name: 'Nullify Magic', page: 50 },
  { value: 6, name: 'Deadly Pursuit', page: 50 },
  { value: 6, name: 'Flight', page: 50 },
  { value: 7, name: 'Scuttle', page: 50 },
  { value: 7, name: 'Nefarious Pact', page: 51 },
  { value: 8, name: 'Entourage', page: 51 },
  { value: 8, name: 'Chatty', page: 51 },
  { value: 9, name: 'Escape Plan', page: 51 },
  { value: 9, name: 'Taskmaster', page: 51 },
  { value: 10, name: 'Lead the Patrol', page: 51 },
  { value: 10, name: 'Serene Countenance', page: 51 },
  { value: 11, name: 'Butterfly Jump', page: 51 },
  { value: 11, name: 'Fortify the Spirit', page: 51 },
  { value: 12, name: 'Extended Reach', page: 51 },
  { value: 12, name: 'Stealth', page: 51 },
  { value: 13, name: 'Warning Growl', page: 51 },
  { value: 13, name: 'Disguised', page: 51 },

  { value: ANY_JOKER, name: 'Choose', page: 51, freeChoice: true },
]

/* ── Tier 3 ─────────────────────────────────────────────────────── */

/**
 * Totems, pp. 52–53. Stat lines are facts of the same kind as the archetype
 * stats in `archetypes.js` — a Df is not rules text — so they are kept, and
 * the sheet's totem card can finally be filled in.
 */
const TOTEM = [
  { value: 1, name: 'Backwoods Bootlegger', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 52 },
  { value: 2, name: 'Cursemonger', stats: { df: 6, wp: 6, sp: 6, health: 9 }, page: 52 },
  { value: 3, name: 'Shadowrunner', stats: { df: 5, wp: 5, sp: 7, health: 9 }, page: 52 },
  { value: 4, name: 'Gearwright', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 52 },
  { value: 5, name: 'Demolitionist', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 52 },
  { value: 6, name: 'Logistics Officer', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 52 },
  { value: 7, name: 'Chance Taker', stats: { df: 6, wp: 5, sp: 6, health: 9 }, page: 52 },
  { value: 8, name: 'Night Marketeer', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 52 },
  { value: 9, name: 'Gravehand', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 53 },
  { value: 10, name: 'Willing Vessel', stats: { df: 4, wp: 5, sp: 6, health: 10 }, page: 53 },
  { value: 11, name: 'Ringmaster', stats: { df: 5, wp: 6, sp: 6, health: 9 }, page: 53 },
  { value: 12, name: 'Mad Surgeon', stats: { df: 5, wp: 4, sp: 6, health: 9 }, page: 53 },
  { value: 13, name: 'Raging Colossus', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 53 },
  { value: BLACK_JOKER, name: 'Sniveling Coward', stats: { df: 4, wp: 4, sp: 6, health: 6 }, page: 53 },
  { value: RED_JOKER, name: 'Mini-Master', stats: { df: 5, wp: 5, sp: 6, health: 9 }, page: 53 },
]

const SUMMONING = [
  { value: null, name: 'Formed of Blood', page: 54 },
  { value: null, name: 'Drawn to Weakness', page: 54 },
  { value: null, name: 'Rally Point', page: 54 },
  { value: null, name: 'Stolen Plans', page: 54 },
  { value: null, name: 'Called into Being', page: 54 },
  { value: null, name: 'Swarm the Place', page: 54 },
  { value: null, name: 'Muster Point', page: 54 },
]

/* ── the tables ─────────────────────────────────────────────────── */

export const ADVANCEMENT_TABLES = [
  {
    id: 'attack', tier: 1, name: 'Attack Modification', page: 38,
    flip: 'orLower', entries: ATTACK,
    /** Adding a trigger to an action that already has two costs 2 scrip. */
    triggerCrowdingFee: 2,
    applies: 'one attack action',
  },
  {
    id: 'tactical', tier: 1, name: 'Tactical Modification', page: 41,
    flip: 'orLower', entries: TACTICAL,
    triggerCrowdingFee: 2,
    applies: 'one tactical action',
  },
  { id: 'action', tier: 2, name: 'Action', page: 44, flip: 'orLower', entries: ACTION },
  { id: 'ability', tier: 2, name: 'Ability', page: 50, flip: 'orLower', entries: ABILITY },
  {
    id: 'totem', tier: 3, name: 'Totem', page: 52,
    flip: 'exact', entries: TOTEM,
    /** Only while the crew has no totem — you may only ever have one. */
    onlyWithoutTotem: true,
  },
  { id: 'summoning', tier: 3, name: 'Summoning', page: 54, flip: 'choose', entries: SUMMONING, oncePerCampaign: true },
  {
    id: 'crew-card', tier: 4, name: 'Crew Card', page: 32,
    flip: 'choose', entries: [],
    /** An effect lifted off a real master's crew card, or one of the three
        starting effects. No table to print, so the pick is written in. */
    freeText: true,
  },
]

export function findTable(id) {
  return ADVANCEMENT_TABLES.find((t) => t.id === id) || null
}

/** Which tables a box of this tier unlocks — tier N or lower. */
export function tablesForTier(tier) {
  if (!tier) return []
  return ADVANCEMENT_TABLES.filter((t) => t.tier <= tier)
}

/**
 * What a flip of this value offers on a given table.
 *
 * `orLower` includes always-available entries and everything at or under the
 * flip; `exact` takes the one row; `choose` ignores the value entirely. Jokers
 * match only rows printed for a joker, on either kind of numbered table.
 */
export function offerFor(table, value) {
  if (!table) return []
  if (table.flip === 'choose') return table.entries
  const isJoker = value === RED_JOKER || value === BLACK_JOKER || value === ANY_JOKER
  if (isJoker) {
    return table.entries.filter(
      (e) => e.value === ANY_JOKER || e.value === value
    )
  }
  if (typeof value !== 'number') return table.entries.filter((e) => e.value === ALWAYS)
  if (table.flip === 'exact') return table.entries.filter((e) => e.value === value)
  return table.entries.filter(
    (e) => e.value === ALWAYS || (typeof e.value === 'number' && e.value <= value)
  )
}
