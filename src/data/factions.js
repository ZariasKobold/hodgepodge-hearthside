/**
 * The eight factions.
 *
 * `slug` is ours and is written into saved campaigns, so it must never change
 * — a rename would orphan every stored arsenal. `registerSlug` is BiggerHat's
 * name for the same faction, used only in query strings.
 *
 * They agree on six of eight. The register uses underscores for the two
 * two-word factions, and querying `?faction=ten-thunders` returns **zero rows
 * rather than an error** — a Ten Thunders player would silently see no
 * Versatile models and nothing anywhere would look broken. That silence is why
 * the mapping is explicit here instead of a `replace('-', '_')` at the call
 * site.
 */
export const FACTIONS = [
  { slug: 'guild', label: 'Guild', registerSlug: 'guild' },
  { slug: 'resurrectionists', label: 'Resurrectionists', registerSlug: 'resurrectionists' },
  { slug: 'arcanists', label: 'Arcanists', registerSlug: 'arcanists' },
  { slug: 'neverborn', label: 'Neverborn', registerSlug: 'neverborn' },
  { slug: 'outcasts', label: 'Outcasts', registerSlug: 'outcasts' },
  { slug: 'bayou', label: 'Bayou', registerSlug: 'bayou' },
  { slug: 'ten-thunders', label: 'Ten Thunders', registerSlug: 'ten_thunders' },
  { slug: 'explorers-society', label: "Explorer's Society", registerSlug: 'explorers_society' },
]

export const factionLabel = (slug) => FACTIONS.find((f) => f.slug === slug)?.label || slug

/**
 * Our slug to the register's. Returns null for an unknown faction rather than
 * guessing, so a caller cannot accidentally issue a query that quietly matches
 * nothing.
 */
export const registerFaction = (slug) =>
  FACTIONS.find((f) => f.slug === slug)?.registerSlug || null
