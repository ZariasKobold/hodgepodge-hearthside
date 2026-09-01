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
    station: record.station || null,
    keywords: (record.keywords || []).map((k) => k.slug),
    characteristics: record.characteristics || [],
    isUnhirable: Boolean(record.is_unhirable),
    isBeta: Boolean(record.is_beta),
    /* `secondFaction`, `keywordNames` and `hasTotem` used to be indexed here
       and were read by nothing, while riding into localStorage on every roster
       cache (audit L3). The second-faction label the crew card shows comes
       from `rules.js`, which is the display path and keeps its own copy. */
    /* `totemSlug` was indexed so `totemSlugs` could build a set of them. Nothing
       reads it now that `isTotem` reads the totem's own characteristics, and an
       unread field still rides into localStorage on every cache (audit L3). */
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
 * Is this model a totem?
 *
 * Read from `characteristics`, the same free-text list `isVersatile` reads,
 * because that is the only place the register actually says so. **`station` is
 * not it** — verified against the live register: no record in any faction
 * carries `station: 'Totem'`, and known totems come back with `station` null,
 * `Peon` or `Minion`.
 *
 * The older signal was `totem_slug`: the master names its totem, so the totem
 * could be recognised by being named. That worked only when the owning master
 * happened to be in the same response, and it is unnecessary — the totem says
 * what it is on its own record.
 */
export function isTotem(model) {
  return (model?.characteristics || []).some(
    (c) => String(c).toLowerCase() === 'totem'
  )
}

/**
 * Is this model hirable at all?
 *
 * Masters have no cost, so the cost check catches them regardless of
 * `station`, which the register returns as null on records that clearly should
 * have one.
 *
 * **Totems are excluded, and the comment here used to say the opposite.** It
 * claimed they were "perfectly hirable" and were kept in the roster on purpose
 * so the weekly hire could buy one. They were not kept: every totem in the
 * register has `cost: null` — checked across two whole factions and against the
 * detail endpoint, which agrees with the index — so the very next condition
 * dropped all of them anyway. The stated behaviour and the real behaviour had
 * been opposites since the comment was written.
 *
 * They stay excluded, now deliberately and by name rather than as a side effect
 * of a data quirk that could change under us. In campaign mode a totem arrives
 * from the tier-3 advancement table (p.52) and nowhere else — a leader built
 * from an archetype is not the master any register totem requires — so a totem
 * in the hire picker would be offering something the rules do not sell.
 */
export function isSelectionSource(model) {
  return (
    model.cost != null &&
    model.cost > 0 &&
    !model.isUnhirable &&
    !model.isBeta &&
    !isTotem(model)
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

/* `totemSlugs` lived here, building a set of the totems a response's masters
   named so `useRoster` could mark them. It is gone: `isTotem` reads the totem's
   own record, which needs no second model present to work, and the flag it
   produced was never true anyway — `useRoster` marked an already-cost-filtered
   list, so no totem ever survived to be marked. */
