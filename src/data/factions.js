export const FACTIONS = [
  { slug: 'guild', label: 'Guild' },
  { slug: 'resurrectionists', label: 'Resurrectionists' },
  { slug: 'arcanists', label: 'Arcanists' },
  { slug: 'neverborn', label: 'Neverborn' },
  { slug: 'outcasts', label: 'Outcasts' },
  { slug: 'bayou', label: 'Bayou' },
  { slug: 'ten-thunders', label: 'Ten Thunders' },
  { slug: 'explorers-society', label: "Explorer's Society" },
]

export const factionLabel = (slug) => FACTIONS.find((f) => f.slug === slug)?.label || slug
