/**
 * The five leader archetypes, from Index of the Untold p.17.
 * Stat lines and allowances are bare facts, so they live in the app.
 * Nothing here reproduces rules text.
 */
export const ARCHETYPES = [
  {
    id: 'lucky_upstart',
    name: 'Lucky Upstart',
    stats: { df: 6, wp: 6, sp: 6, health: 14 },
    slots: { attack: { n: 1, cap: 6 }, tactical: { n: 0, cap: 0 }, ability: { n: 1, cap: 6 } },
    keepsTrigger: false,
    freeEquipment: true,
    note: 'Also takes a free equipment upgrade by uncheatable flip, returned to the arsenal if annihilated.',
  },
  {
    id: 'generalist',
    name: 'Generalist',
    stats: { df: 5, wp: 5, sp: 6, health: 14 },
    slots: { attack: { n: 1, cap: 7 }, tactical: { n: 1, cap: 7 }, ability: { n: 1, cap: 7 } },
    keepsTrigger: false,
    freeEquipment: false,
    note: 'Even allowances across all three slots.',
  },
  {
    id: 'heavy_hitter',
    name: 'Heavy Hitter',
    stats: { df: 6, wp: 4, sp: 6, health: 14 },
    slots: { attack: { n: 1, cap: 10 }, tactical: { n: 1, cap: 5 }, ability: { n: 0, cap: 0 } },
    keepsTrigger: true,
    freeEquipment: false,
    note: 'The only archetype that keeps a trigger on its attack action.',
  },
  {
    id: 'schemer',
    name: 'Schemer',
    stats: { df: 6, wp: 5, sp: 7, health: 13 },
    slots: { attack: { n: 1, cap: 5 }, tactical: { n: 2, cap: 8 }, ability: { n: 1, cap: 8 } },
    keepsTrigger: false,
    freeEquipment: false,
    note: 'Two tactical actions, drawn from one ally or two.',
  },
  {
    id: 'talented_individual',
    name: 'Talented Individual',
    stats: { df: 5, wp: 5, sp: 5, health: 13 },
    slots: { attack: { n: 1, cap: 6 }, tactical: { n: 1, cap: 6 }, ability: { n: 2, cap: 8 } },
    keepsTrigger: false,
    freeEquipment: false,
    note: 'Two abilities, drawn from one ally or two.',
  },
]

export const SLOTS = ['attack', 'tactical', 'ability']

export const slotLabel = (slot) =>
  slot === 'ability' ? 'Abilities' : slot === 'attack' ? 'Attack actions' : 'Tactical actions'

export const getArchetype = (id) => ARCHETYPES.find((a) => a.id === id) || null
