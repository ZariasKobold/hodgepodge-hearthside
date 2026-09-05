import { useEffect, useMemo } from 'react'
import { SLOTS, slotLabel } from '../data/archetypes.js'
import { getEffect } from '../data/crewCards.js'
import { factionLabel } from '../data/factions.js'
import { sourceSlug, findEntry, findTrigger } from '../lib/rules.js'
import { RulesState, TriggerBody, ActionAdvancements } from './RulesText.jsx'
import { advancementsOn, gainedActionKey } from '../lib/advancement.js'
import { PrintLegal } from './ui.jsx'

/**
 * The leader's filed record.
 *
 * Extracted so the creation wizard's last step and the standing arsenal view
 * render the same document rather than two that drift. It is the *leader*, not
 * the crew — the roster and the crew cards sit around it, not inside it.
 *
 * Fetches its own rules text on mount. The selections come from at most a
 * handful of models, so this is bounded; the arsenal is not, which is why crew
 * cards stay behind a button.
 */
export default function LeaderRecord({ leader, archetype, fileNumber, rules }) {
  const effect = getEffect(leader.crewCard.effect)

  const pickSlugs = useMemo(() => {
    const out = new Set()
    for (const slot of SLOTS) {
      for (const pick of leader.picks[slot] || []) {
        const slug = sourceSlug(pick)
        if (slug) out.add(slug)
      }
    }
    return [...out]
  }, [leader.picks])

  const fingerprint = pickSlugs.join('|')
  useEffect(() => {
    pickSlugs.forEach((slug) => rules.ensure(slug))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, rules.ensure])

  /**
   * The single trigger a Heavy Hitter keeps, resolved back to its text.
   *
   * Deliberately not memoised: the card arrives asynchronously and `rules.card`
   * reads through a module-level map, so any dependency list would go stale the
   * moment the fetch landed.
   */
  const attackPick = leader.picks.attack?.[0] || null
  const keptTrigger = (() => {
    if (!leader.trigger || !attackPick) return null
    const slug = sourceSlug(attackPick)
    const card = slug ? rules.card(slug) : null
    const action = card ? findEntry(card, 'attack', attackPick.name) : null
    return findTrigger(action, leader.trigger)
  })()

  const anyText = pickSlugs.some((slug) => rules.card(slug))

  /**
   * Actions and abilities the leader was given by a tier-2 advancement.
   *
   * They had nowhere on this record until v0.22.2 — the record listed the
   * creation picks and stopped — so a leader who had earned an action showed a
   * card that was missing it. Anything a tier-1 modifier is later hung on lives
   * here too, which is why the keys go through `gainedActionKey`.
   */
  const gained = (leader.advancements || [])
    .filter((a) => a.tableId === 'action' || a.tableId === 'ability')
    .map((a) => ({
      key: a.id || `${a.tableId}::${a.name}`,
      name: a.name,
      tableName: a.tableName,
      page: a.page,
      source: a,
    }))

  /**
   * Everything else that was earned, so nothing an advancement bought is
   * invisible on the document a player carries to a table.
   *
   * An advancement is shown under its action when the app can name that action,
   * and here otherwise — a summoning effect, which attaches to nothing, and a
   * modifier whose target was written in by hand because there was no list to
   * pick from. The target still prints; it is just not a link to anything.
   */
  const placed = new Set(
    [...SLOTS.flatMap((slot) => leader.picks[slot] || []).map((p) => p.key),
      ...gained.map((g) => gainedActionKey(g.source))]
  )
  const loose = (leader.advancements || []).filter(
    (a) => a.tableId !== 'action' && a.tableId !== 'ability'
      && !(a.appliesTo?.key && placed.has(a.appliesTo.key))
  )

  return (
    <article className="record">
      <div className="record__head">
        <span className="record__eyebrow">
          {factionLabel(leader.faction)} · {archetype.name}
        </span>
        <span className="record__file">{fileNumber}</span>
      </div>

      {/* The picture belongs on the document, not only on the shelf card it
          was first wired to (audit L12). It prints, because the record is one
          of the things people carry to a table. */}
      <div className="record__identity">
        <div>
          <h2 className="record__name">{leader.name || 'Unnamed leader'}</h2>
          <div className="record__line">
            {leader.keywords.filter(Boolean).join(' / ')} · {leader.advancementPath} · Sz {leader.size} ·{' '}
            {leader.base}mm{leader.characteristics.length ? ` · ${leader.characteristics.join(', ')}` : ''} · master
          </div>
        </div>
        {leader.portrait && (
          <img className="record__portrait" src={leader.portrait} alt="" />
        )}
      </div>

      <div className="record__stats">
        {[['Df', archetype.stats.df], ['Wp', archetype.stats.wp], ['Sp', archetype.stats.sp], ['Health', archetype.stats.health]].map(
          ([k, v]) => (
            <div key={k}>
              <div className="record__stat-k">{k}</div>
              <div className="record__stat-v">{v}</div>
            </div>
          )
        )}
      </div>

      {SLOTS.map((slot) =>
        leader.picks[slot].length > 0 ? (
          <section className="record__section" key={slot}>
            <div className="record__section-k">{slotLabel(slot)}</div>
            {leader.picks[slot].map((p) => {
              // Advancements attach to one action (p. 31), so they belong under
              // it rather than in a list somewhere else on the page.
              const earned = advancementsOn(leader, p.key)
              return (
                <div className="record__written" key={p.key}>
                  <div className="record__entry">
                    {p.name} <span>— from {p.model}, {p.cost}ss</span>
                  </div>
                  {/* showTriggers off: the leader took the action, not the source
                      model's triggers. Those are earned or granted. */}
                  <RulesState
                    rules={rules}
                    slug={sourceSlug(p)}
                    slot={slot}
                    name={p.name}
                    quiet
                    showTriggers={false}
                    advancements={earned}
                  />
                  <ActionAdvancements advancements={earned} />
                </div>
              )
            })}
          </section>
        ) : null
      )}

      {gained.length > 0 && (
        <section className="record__section">
          <div className="record__section-k">Gained by advancement</div>
          {gained.map((g) => {
            const earned = advancementsOn(leader, gainedActionKey(g.source))
            return (
              <div className="record__written" key={g.key}>
                <div className="record__entry">
                  {g.name} <span>— {g.tableName}{g.page ? `, p.${g.page}` : ''}</span>
                </div>
                <ActionAdvancements advancements={earned} />
              </div>
            )
          })}
        </section>
      )}

      {loose.length > 0 && (
        <section className="record__section">
          <div className="record__section-k">Advancements</div>
          {loose.map((a, i) => (
            <div className="record__entry" key={a.id || `${a.name}-${i}`}>
              {a.name}
              <span>
                {' — '}{a.tableName}
                {a.appliesTo ? `, on ${a.appliesTo.name}` : ''}
                {a.page ? `, p.${a.page}` : ''}
              </span>
            </div>
          ))}
        </section>
      )}

      {leader.trigger && (
        <section className="record__section">
          <div className="record__section-k">Trigger</div>
          <div className="record__written">
            <div className="record__entry">
              {leader.trigger}
              {attackPick && <span> — on {attackPick.name}</span>}
            </div>
            <TriggerBody trigger={keptTrigger} />
          </div>
        </section>
      )}

      {effect && (
        <section className="record__section">
          <div className="record__section-k">Crew card</div>
          <div className="record__entry">
            {effect.name}
            <span> — {leader.crewCard.choice ? `${leader.crewCard.choice}, ` : ''}p.{effect.page}</span>
          </div>
        </section>
      )}

      {archetype.freeEquipment && (
        <section className="record__section">
          <div className="record__section-k">Equipment</div>
          <div className="record__entry">
            One free upgrade by uncheatable flip <span>— returned to the arsenal if annihilated</span>
          </div>
        </section>
      )}

      <div className="record__foot">
        {anyText
          ? 'Action and ability text is read live from BiggerHat and is not stored by this app. Triggers on a source model are not carried over — a leader has only the trigger it was granted or has earned. Your cards remain the authority.'
          : 'Rules text lives on your cards. This record holds names and costs only.'}
        <PrintLegal />
      </div>
    </article>
  )
}
