import { Button, Label, PrintLegal } from './ui.jsx'
import { EntryBody } from './RulesText.jsx'

/**
 * The hired models, read out in full.
 *
 * Behind a button rather than automatic, because an arsenal grows all campaign
 * and this is one request per model against a donation-funded register. The
 * text arrives live and is never stored (§4), so the button is also the honest
 * signal that this needs the register to be up.
 */
function StatCard({ card, hired }) {
  const line = [
    card.keywords.join(' / '),
    card.stationLabel,
    card.size != null ? `Sz ${card.size}` : null,
    card.baseLabel,
    card.characteristics.join(', ') || null,
  ].filter(Boolean)

  const attacks = card.actions.filter((a) => a.type === 'attack')
  const tacticals = card.actions.filter((a) => a.type !== 'attack')

  const groups = [
    ['Attack actions', attacks, 'attack'],
    ['Tactical actions', tacticals, 'tactical'],
    ['Abilities', card.abilities, 'ability'],
  ]

  return (
    <article className="crewcard">
      <div className="crewcard__head">
        <span className="record__eyebrow">
          {[card.factionLabel, card.secondFactionLabel].filter(Boolean).join(' / ')}
        </span>
        <span className="record__file">
          {hired?.count > 1 ? `×${hired.count} · ` : ''}{hired?.cost ?? card.cost}ss
        </span>
      </div>

      <h3 className="crewcard__name">{card.name}</h3>
      {line.length > 0 && <div className="record__line">{line.join(' · ')}</div>}

      <div className="record__stats">
        {[
          ['Df', card.defense, card.defenseSuit],
          ['Wp', card.willpower, card.willpowerSuit],
          ['Sp', card.speed, null],
          ['Health', card.health, null],
        ]
          .filter(([, v]) => v != null)
          .map(([k, v, suit]) => (
            <div key={k}>
              <div className="record__stat-k">{k}</div>
              <div className="record__stat-v">{v}{suit ? <small> {suit}</small> : null}</div>
            </div>
          ))}
      </div>

      {groups.map(([heading, entries, slot]) =>
        entries.length > 0 ? (
          <section className="record__section" key={heading}>
            <div className="record__section-k">{heading}</div>
            {entries.map((entry) => (
              <div className="crewcard__entry" key={entry.slug || entry.name}>
                <div className="record__entry">{entry.name}</div>
                <EntryBody entry={entry} slot={slot} />
              </div>
            ))}
          </section>
        ) : null
      )}

      <div className="record__foot">
        Read live from BiggerHat and not stored. Your cards remain the authority.
        {/* Each card starts its own printed page, so each carries the notice. */}
        <PrintLegal />
      </div>
    </article>
  )
}

export default function CrewCards({ models, rules }) {
  /**
   * Grouped by slug, because the arsenal holds one entry per hired model and
   * two Swashbucklers share one card. Ungrouped, the printed dossier repeated
   * the same page verbatim and the tally counted copies rather than cards
   * (audit M3).
   */
  const distinct = []
  const seen = new Map()
  for (const m of models) {
    if (!m.slug) continue
    const already = seen.get(m.slug)
    if (already) { already.count += 1; continue }
    const entry = { ...m, count: 1 }
    seen.set(m.slug, entry)
    distinct.push(entry)
  }

  const byHand = models.filter((m) => !m.slug).length
  const { loading, done, total, error } = rules.batch
  const loaded = distinct.filter((m) => rules.card(m.slug))
  const withSlug = distinct

  return (
    <section className="crew">
      <div className="slot__head noprint">
        <Label>Crew cards</Label>
        {loaded.length > 0 && (
          <span className="tally">{loaded.length} of {withSlug.length} read</span>
        )}
      </div>

      <div className="crew__bar noprint">
        <Button
          onClick={() => rules.ensureAll(withSlug.map((m) => m.slug))}
          disabled={loading || withSlug.length === 0}
        >
          {/* "Refresh" only once the whole crew is in. A model whose card was
              already read as a selection source must not make the button claim
              there is nothing left to fetch. */}
          {loading
            ? `Reading ${done}/${total}…`
            : loaded.length === withSlug.length
              ? 'Refresh crew cards'
              : 'Load crew cards from BiggerHat'}
        </Button>
        {byHand > 0 && (
          <span className="label" style={{ margin: 0 }}>
            {byHand} entered by hand — no record to read.
          </span>
        )}
      </div>

      {error && <p className="note note--warn noprint">{error}</p>}

      {withSlug.length === 0 && models.length === 0 && (
        <div className="empty noprint">Hire something first and its card can be read here.</div>
      )}

      {loaded.map((m) => (
        <StatCard key={m.slug} card={rules.card(m.slug)} hired={m} />
      ))}
    </section>
  )
}
