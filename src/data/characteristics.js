/**
 * Every characteristic the game currently has, and the subset a leader may pick.
 *
 * The book, p.17: "Your leader automatically gains the master characteristic.
 * In addition, you may choose up to two characteristics (such as living or
 * construct) for your leader." It names no list and forbids nothing — campaign
 * mode "unapologetically leaned into creativity and freedom" — so the full set
 * below is the game's, and the narrowing is this project's own, by owner
 * decision. The two are kept apart deliberately: `CHARACTERISTICS` is a fact
 * about Malifaux and `LEADER_CHARACTERISTICS` is a house rule, and a later
 * reader must be able to tell which is which.
 *
 * **Verified against the register, 2026-08-31**, rather than remembered. Every
 * character in all eight factions was fetched and its `characteristics`
 * tallied: 798 characters, 23 distinct values, and these are they. The counts,
 * for whoever later wonders whether an odd one is a typo — unique 549,
 * living 492, construct 127, totem 122, henchman 114, versatile 114, undead 74,
 * beast 58, loyal 31, elemental 15, effigy 9, zombie 9, cult 7, story 7,
 * student 5, gamin 4, horseman 4, puppet 4, sister 4, golem 3, vermin 2,
 * witchling 2, plant 1.
 *
 * Three of the eight this file used to offer were not characteristics at all:
 * **Nightmare** is a keyword, and **Spirit** and **Mimic** are neither
 * characteristic nor keyword in Fourth Edition. They are gone;
 * `characteristicOptions` is what keeps that from stranding a leader who
 * already picked one.
 *
 * Title Case here, lower case in the register. Display wins: these print on the
 * leader's record and on the arsenal sheet, and `isVersatile` and `isTotem`
 * both compare case-insensitively, so nothing downstream cares.
 */
export const CHARACTERISTICS = [
  'Beast', 'Construct', 'Cult', 'Effigy', 'Elemental', 'Gamin', 'Golem',
  'Henchman', 'Horseman', 'Living', 'Loyal', 'Plant', 'Puppet', 'Sister',
  'Story', 'Student', 'Totem', 'Undead', 'Unique', 'Vermin', 'Versatile',
  'Witchling', 'Zombie',
]

/**
 * Real characteristics that describe something a leader is not. Owner decision.
 *
 * Each one contradicts a rule this app already holds, rather than merely reading
 * oddly:
 *
 * - **Totem** — a totem is a separate model with its own section on the arsenal
 *   sheet, and this app reaches one only through the tier-3 advancement table.
 *   Offering it on the leader would say the leader is its own totem.
 * - **Versatile** — it means "hirable regardless of keyword", and the leader is
 *   never hired. The book: "Players do not spend any soulstones to add their
 *   leader into their arsenal."
 * - **Henchman** — a station. The leader's is master, which `ArsenalSheet`
 *   appends without asking; the two cannot both be true.
 *
 * **Unique is deliberately not here.** It is true of a leader either way, so
 * spending one of the two on it is a waste rather than a contradiction — and
 * that is the player's waste to choose. 549 of the register's 798 characters
 * carry it.
 */
export const NOT_ON_A_LEADER = ['Henchman', 'Totem', 'Versatile']

/** The 20 a leader may be given, in the same order as the full set. */
export const LEADER_CHARACTERISTICS =
  CHARACTERISTICS.filter((c) => !NOT_ON_A_LEADER.includes(c))

/**
 * The chips to draw, given what a leader is already carrying.
 *
 * Not simply the list, and the difference is the whole reason this function
 * exists. A leader may hold a value the list no longer offers — 'Nightmare',
 * 'Spirit' or 'Mimic' from before the list was corrected, or one of
 * `NOT_ON_A_LEADER` arriving in an imported JSON, which is a file this app does
 * not get to vet. Drawing only the offered set would leave that value **on the
 * leader and off the screen**: still printed on the record and the arsenal
 * sheet, still counting against the limit of two, and with no chip to switch it
 * off. A stuck characteristic is worse than a disallowed one.
 *
 * So anything already selected is drawn, wherever it sorts. Switch it off and
 * it leaves the list, because it is not on offer and there is no route back — a
 * one-way door, which is the intended behaviour and not a glitch.
 *
 * Nothing here rewrites what is stored. Editing somebody's leader behind their
 * back to tidy a list is not this file's business.
 *
 * `base` exists for the totem, which the book (p.32) also grants "up to two
 * characteristics... in the same manner as for your leader" and which has no
 * picker yet — its excluded set is not the leader's, since a totem plainly may
 * be a Totem.
 */
export function characteristicOptions(selected = [], base = LEADER_CHARACTERISTICS) {
  const all = new Set(base)
  for (const c of selected) {
    if (typeof c === 'string' && c.trim()) all.add(c.trim())
  }
  return [...all].sort((a, b) => a.localeCompare(b))
}
