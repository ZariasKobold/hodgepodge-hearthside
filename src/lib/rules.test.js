import { describe, it, expect } from 'vitest'
import {
  iconSegments, plainText, toCard, findAction, findAbility, findEntry,
  sourceSlug, statLine,
} from './rules.js'
import { buildSheet, LEGAL } from './recordImage.js'

/* The register's own data, trimmed. Kept verbatim in shape because every
   field name here is upstream's to choose, not ours. */
const RECORD = {
  slug: 'aunty-mel',
  name: 'Aunty Mel',
  display_name: 'Aunty Mel',
  cost: 8,
  faction: 'bayou',
  faction_label: 'Bayou',
  station_label: null,
  keywords: [{ name: 'Angler', slug: 'angler' }],
  characteristics: ['unique', 'henchman', 'living'],
  size: 1,
  base: 30,
  base_label: '30mm',
  health: 11,
  defense: 6,
  willpower: 6,
  speed: 5,
  actions: [
    {
      name: 'Ol’ Thunder',
      slug: '291-ol-thunder',
      type: 'attack',
      is_signature: false,
      stone_cost: 0,
      range: '*',
      range_type_label: null,
      stat: '6',
      resisted_by: 'Df',
      damage: '3',
      description: 'Choose {{melee}}1" or {{missile}}10". Receives a {{+}}.',
      triggers: [
        { name: 'Critical Strike', slug: 'critical-strike', suits: 'Ram', stone_cost: 0, description: 'Deals +1 damage.' },
      ],
    },
    {
      name: 'Life Raft',
      slug: 'life-raft',
      type: 'tactical',
      is_signature: true,
      stone_cost: 1,
      range: '3',
      range_type_label: 'Pulse',
      stat: '0',
      target_number: '6',
      damage: null,
      description: 'Push each model 3".',
      triggers: [],
    },
  ],
  abilities: [
    { name: 'Hard to Kill', slug: 'hard-to-kill', costs_stone: 0, description: 'May not be reduced below 1 health.' },
  ],
}

describe('icon markup', () => {
  it('splits tokens out of prose', () => {
    const segs = iconSegments('Choose {{melee}}1" or {{missile}}10".')
    expect(segs.filter((s) => s.kind === 'icon').map((s) => s.value)).toEqual(['Melee', 'Missile'])
    // The gap is put back: on the card the glyph touches the measurement,
    // but spelled out "Melee1" reads as one word.
    expect(segs.map((s) => s.value).join('')).toBe('Choose Melee 1" or Missile 10".')
  })

  it('reads the register’s typos rather than leaking braces', () => {
    // {{missle}} and {{{pulse}} both occur upstream.
    expect(plainText('a {{missle}} b {{{pulse}} c')).toBe('a Missile b Pulse c')
  })

  it('renders an unknown token as a word, never as braces', () => {
    expect(plainText('gains {{saction}}')).toBe('gains Saction')
    expect(plainText('gains {{saction}}')).not.toContain('{')
  })

  it('keeps the flip modifiers readable', () => {
    expect(plainText('receives a {{+}} and a {{-}}')).toBe('receives a + and a −')
  })

  it('leaves plain text alone', () => {
    expect(plainText('No markup here.')).toBe('No markup here.')
    expect(iconSegments('No markup here.')).toEqual([{ kind: 'text', value: 'No markup here.' }])
  })

  it('tolerates nothing at all', () => {
    expect(plainText(null)).toBe('')
    expect(iconSegments(undefined)).toEqual([])
  })
})

describe('toCard', () => {
  const card = toCard(RECORD)

  it('keeps the descriptions indexing.js deliberately drops', () => {
    expect(card.actions[0].description).toContain('Choose')
    expect(card.abilities[0].description).toContain('1 health')
    expect(card.actions[0].triggers[0].description).toBe('Deals +1 damage.')
  })

  it('carries the stat block', () => {
    expect(card).toMatchObject({ name: 'Aunty Mel', cost: 8, health: 11, defense: 6, speed: 5, baseLabel: '30mm' })
    expect(card.keywords).toEqual(['Angler'])
  })

  it('survives a record with no actions or abilities', () => {
    const thin = toCard({ slug: 'x', name: 'X' })
    expect(thin.actions).toEqual([])
    expect(thin.abilities).toEqual([])
    expect(thin.keywords).toEqual([])
  })
})

describe('finding an entry by name', () => {
  const card = toCard(RECORD)

  it('matches across curly and straight apostrophes', () => {
    expect(findAction(card, "Ol' Thunder")?.slug).toBe('291-ol-thunder')
    expect(findAction(card, 'Ol’ Thunder')?.slug).toBe('291-ol-thunder')
  })

  it('keeps actions and abilities apart', () => {
    expect(findAbility(card, 'Hard to Kill')?.name).toBe('Hard to Kill')
    expect(findAction(card, 'Hard to Kill')).toBeNull()
    expect(findEntry(card, 'ability', 'Hard to Kill')).not.toBeNull()
    expect(findEntry(card, 'attack', 'Hard to Kill')).toBeNull()
  })

  it('returns null rather than throwing when nothing is loaded', () => {
    expect(findEntry(null, 'attack', 'Anything')).toBeNull()
  })
})

describe('statLine', () => {
  const card = toCard(RECORD)

  it('reads an attack in printed-card order', () => {
    expect(statLine(findAction(card, 'Ol’ Thunder'))).toEqual(['Rg *', 'Stat 6', 'vs Df', 'Dmg 3'])
  })

  it('names the range type and the target number on a tactical', () => {
    expect(statLine(findAction(card, 'Life Raft'))).toEqual(['1ss', 'Signature', 'Pulse 3"', 'Stat 0', 'TN 6'])
  })

  it('is empty for nothing', () => {
    expect(statLine(null)).toEqual([])
  })
})

describe('sourceSlug', () => {
  it('recovers the model from a selection key', () => {
    expect(sourceSlug({ key: 'aunty-mel::attack::Ol’ Thunder' })).toBe('aunty-mel')
  })

  it('refuses hand-entered picks, which have no register record', () => {
    expect(sourceSlug({ key: 'manual::Some Model::Some Action', manual: true })).toBeNull()
    // The flag is the reliable signal, but the prefix alone is enough.
    expect(sourceSlug({ key: 'manual::Some Model::Some Action' })).toBeNull()
  })

  it('handles junk', () => {
    expect(sourceSlug(null)).toBeNull()
    expect(sourceSlug({})).toBeNull()
  })
})

describe('buildSheet', () => {
  const archetype = {
    id: 'schemer',
    name: 'Schemer',
    stats: { df: 6, wp: 5, sp: 7, health: 13 },
    freeEquipment: false,
  }
  const leader = {
    name: 'Cletus and Duke Carcinus',
    keywords: ['angler', 'banished'],
    advancementPath: 'strategist',
    size: 3,
    base: 50,
    characteristics: ['Living'],
    trigger: '',
    crewCard: { effect: 'shape_the_landscape', choice: 'Tide' },
    picks: {
      attack: [{ key: 'aunty-mel::attack::Ol’ Thunder', name: 'Ol’ Thunder', model: 'Aunty Mel', cost: 8 }],
      tactical: [],
      ability: [{ key: 'manual::Hand Model::Made Up', name: 'Made Up', model: 'Hand Model', cost: 4, manual: true }],
    },
  }
  const args = {
    leader,
    archetype,
    factionLabel: 'Neverborn',
    fileNumber: 'HH-NE-7017',
    slots: ['attack', 'tactical', 'ability'],
    slotLabel: (s) => ({ attack: 'Attack actions', tactical: 'Tactical actions', ability: 'Abilities' }[s]),
    effect: { id: 'shape_the_landscape', name: 'Shape the Landscape', page: 15 },
    cardFor: (slug) => (slug === 'aunty-mel' ? toCard(RECORD) : null),
  }

  it('writes the rules text out flat, icons and all', () => {
    const sheet = buildSheet(args)
    const attack = sheet.sections.find((s) => s.heading === 'Attack actions').entries[0]
    expect(attack.title).toBe('Ol’ Thunder')
    expect(attack.stat).toBe('Rg * · Stat 6 · vs Df · Dmg 3')
    expect(attack.body).toContain('Melee 1"')
    expect(attack.body).not.toContain('{{')
    expect(attack.triggers[0].title).toBe('Ram — Critical Strike')
  })

  it('leaves a hand-entered pick as a name, with no invented text', () => {
    const ability = buildSheet(args).sections.find((s) => s.heading === 'Abilities').entries[0]
    expect(ability.title).toBe('Made Up')
    expect(ability.body).toBe('')
    expect(ability.stat).toBe('')
  })

  it('skips empty slots and keeps the crew card', () => {
    const headings = buildSheet(args).sections.map((s) => s.heading)
    expect(headings).not.toContain('Tactical actions')
    expect(headings).toContain('Crew card')
  })

  it('prints the equipment line only for archetypes that get one', () => {
    expect(buildSheet(args).sections.map((s) => s.heading)).not.toContain('Equipment')
    const withKit = buildSheet({ ...args, archetype: { ...archetype, freeEquipment: true } })
    expect(withKit.sections.map((s) => s.heading)).toContain('Equipment')
  })

  it('degrades to names when the register never answered', () => {
    const sheet = buildSheet({ ...args, cardFor: () => null })
    const attack = sheet.sections.find((s) => s.heading === 'Attack actions').entries[0]
    expect(attack.title).toBe('Ol’ Thunder')
    expect(attack.body).toBe('')
  })

  it('carries Wyrd’s disclaimer onto every exported sheet', () => {
    expect(buildSheet(args).legal).toBe(LEGAL)
    expect(buildSheet(args).legal).toContain('Wyrd Miniatures, LLC')
  })

  it('builds the identity line the record shows', () => {
    const sheet = buildSheet(args)
    expect(sheet.eyebrow).toBe('Neverborn · Schemer')
    expect(sheet.line).toBe('angler / banished · strategist · Sz 3 · 50mm · Living · master')
    expect(sheet.stats).toEqual([['Df', 6], ['Wp', 5], ['Sp', 7], ['Health', 13]])
  })
})
