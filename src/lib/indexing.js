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
 * Is this model hirable at all?
 *
 * Masters have no cost, so the cost check catches them regardless of
 * `station`, which the register returns as null on records that clearly should
 * have one.
 *
 * **Totems are deliberately not filtered here.** They are perfectly hirable —
 * they are only barred as a *source for a leader selection*, which is
 * `checkSource`'s business. Stripping them from the roster would bar the
 * weekly hire from buying one. `useRoster` marks them `isTotem` instead, using
 * `totemSlugs` below, and the rule reads that flag.
 */
export function isSelectionSource(model) {
  return (
    model.cost != null &&
    model.cost > 0 &&
    !model.isUnhirable &&
    !model.isBeta
  )
}

/**
 * Versatile models may be hired by any crew of their faction, keyword or not.
 *
 * Read from `characteristics`, which the faction index and the character detail
 * both carry — the *keyword* index does not, which is why a model loaded only
 * through `/keywords/{slug}` can look non-Versatile until its detail arrives.
 * Compared case-insensitively because it is someone else's free-text list.
 *
 * This governs **hiring only**. It does not make a model a legal source for a
 * leader selection: that rule is keyword overlap and lives in `checkSource`,
 * which is deliberately untouched by this.
 */
export function isVersatile(model) {
  return (model?.characteristics || []).some(
    (c) => String(c).toLowerCase() === 'versatile'
  )
}

/** Totems are named by the character that owns them, so collect them separately. */
export function totemSlugs(models) {
  return new Set(models.map((m) => m.totemSlug).filter(Boolean))
}
