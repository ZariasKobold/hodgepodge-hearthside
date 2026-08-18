/**
 * Turns a register record into the shape this app keeps.
 *
 * The important part is what it drops. Every `description` field — on actions,
 * abilities, triggers, tokens — is left behind. We keep identifiers: who the
 * model is, what it costs, which keywords it has, and what its actions are
 * called. That is everything the legality rules need and nothing more.
 */
export function toIndexedModel(record) {
  return {
    slug: record.slug,
    name: record.display_name || record.name,
    cost: record.cost,
    faction: record.faction,
    secondFaction: record.second_faction || null,
    station: record.station || null,
    keywords: (record.keywords || []).map((k) => k.slug),
    keywordNames: (record.keywords || []).map((k) => k.name),
    characteristics: record.characteristics || [],
    isUnhirable: Boolean(record.is_unhirable),
    isBeta: Boolean(record.is_beta),
    hasTotem: record.has_totem_id != null,
    totemSlug: record.totem_slug || null,
    actions: (record.actions || []).map((a) => ({
      name: a.name,
      slug: a.slug,
      type: a.type, // 'attack' | 'tactical'
      triggers: (a.triggers || []).map((t) => t.name),
    })),
    abilities: (record.abilities || []).map((a) => a.name),
    /** Index responses omit actions; detail responses include them. */
    hasDetail: Array.isArray(record.actions),
  }
}

/**
 * Can this model ever be a source for a leader selection?
 *
 * The rule bars masters, totems and models without a cost. Masters have no
 * cost at all, so the cost check catches two of those three categories on its
 * own — which matters, because `station` comes back null on records that
 * clearly should have one.
 */
export function isSelectionSource(model) {
  return (
    model.cost != null &&
    model.cost > 0 &&
    !model.isUnhirable &&
    !model.isBeta
  )
}

/** Totems are named by the character that owns them, so collect them separately. */
export function totemSlugs(models) {
  return new Set(models.map((m) => m.totemSlug).filter(Boolean))
}
