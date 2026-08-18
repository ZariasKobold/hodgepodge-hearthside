/**
 * The twelve starting crew card effects (Index of the Untold pp.15-16).
 * Names and constraints only — the effect text stays in your book.
 */
export const CREW_CARD_EFFECTS = [
  { id: 'expert_coordination', name: 'Expert Coordination', page: 15 },
  { id: 'shape_the_landscape', name: 'Shape the Landscape', page: 15, choice: 'marker' },
  { id: 'heavy_blow', name: 'Heavy Blow', page: 15 },
  { id: 'prepared_for_anything', name: 'Prepared For Anything', page: 16 },
  { id: 'scavengers_instinct', name: "Scavenger's Instinct", page: 16 },
  { id: 'inhuman_determination', name: 'Inhuman Determination', page: 16 },
  { id: 'loot_their_stash', name: 'Loot Their Stash', page: 16 },
  { id: 'sadistic_blow', name: 'Sadistic Blow', page: 16 },
  {
    id: 'unusual_specialty',
    name: 'Unusual Specialty',
    page: 16,
    choice: 'token',
    barred: ['Fast', 'Aetheric Surge'],
  },
  { id: 'the_plan_comes_together', name: 'The Plan Comes Together', page: 16 },
  {
    id: 'forbidden_curse',
    name: 'Forbidden Curse',
    page: 16,
    choice: 'token',
    barred: ['Flicker', 'Summon'],
  },
  { id: 'specialized_tools', name: 'Specialized Tools', page: 16, choice: 'upgrade type' },
]

export const getEffect = (id) => CREW_CARD_EFFECTS.find((e) => e.id === id) || null
