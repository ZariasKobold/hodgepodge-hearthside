import { factionLabel } from '../data/factions.js'
import { arsenalTotal } from '../lib/campaign.js'

/**
 * One other player's arsenal, read-only.
 *
 * Not `ArsenalSheet`. That component renders a live campaign object — it reads
 * the register for action values, resolves crew card effects, prints the
 * experience track and expects `campaign.games` — and none of that is in what
 * the server sends across the member boundary. Feeding it a half-shaped object
 * would either throw or, worse, render blanks that look like facts.
 *
 * What arrives is the arsenal *projection*: the fields the rules make public
 * (p.14) and no more. So this renders exactly those and says plainly where the
 * edges are, rather than implying a completeness it does not have.
 *
 * ## The identity rule, restated at the point of use
 *
 * `member.nickname` is always present. `member.displayName` exists only when
 * that player opted in, per campaign. There is no fallback to a Discord name
 * when the nickname is blank — falling back would defeat the setting — so an
 * unnamed player reads as "unnamed player", which is the honest answer.
 */
export default function SharedArsenal({ arsenal }) {
  const { member = {}, leader = {}, models = [], injuries = [], equipment = [], totem } = arsenal
  const live = models.filter((m) => !m.annihilated)
  const total = arsenalTotal(live)
  const activeInjuries = injuries.filter((i) => !i.removedAt)

  const name = member.nickname || (member.isYou ? 'You' : 'unnamed player')

  return (
    <article className={`shared${member.isYou ? ' shared--mine' : ''}`}>
      <header className="shared__head">
        <div>
          <div className="shared__who">
            {name}
            {member.isYou && <span className="hire__adj"> (you)</span>}
            {arsenal.isHost && <span className="hire__adj"> · host</span>}
          </div>
          <h3 className="shared__leader">{leader.name || 'Unnamed leader'}</h3>
          <div className="shared__meta">
            {factionLabel(arsenal.faction) || 'no faction'}
            {arsenal.keywords?.length > 0 && ` · ${arsenal.keywords.join(' / ')}`}
            {leader.archetype && ` · ${leader.archetype}`}
          </div>
        </div>

        {/* Only where they chose to show it. No avatar element at all
            otherwise — an empty circle would still announce that there is a
            person behind it whose picture is being withheld. */}
        {member.sharesIdentity && member.displayName && (
          <div className="shared__identity">
            {member.avatarUrl && (
              <img className="shared__avatar" src={member.avatarUrl} alt="" width="36" height="36" />
            )}
            <span className="shared__handle">{member.displayName}</span>
          </div>
        )}
      </header>

      <div className="hire__ledger shared__ledger">
        <span><strong>{total}</strong> soulstones</span>
        <span><strong>{live.length}</strong> models</span>
        <span><strong>{arsenal.scrip ?? 0}</strong> scrip</span>
        <span><strong>{activeInjuries.length}</strong> injuries</span>
        {leader.advancements?.length > 0 && (
          <span><strong>{leader.advancements.length}</strong> advancements</span>
        )}
      </div>

      <div className="shared__cols">
        <section>
          <div className="label">Roster</div>
          {live.length === 0 ? (
            <p className="note">Nothing in the arsenal yet.</p>
          ) : (
            <ul className="hire__list">
              {live.map((m) => (
                <li key={m.id}>
                  <span>{m.name}</span>
                  <span className="hire__paid">{m.cost}ss</span>
                </li>
              ))}
            </ul>
          )}
          {models.length > live.length && (
            <p className="note">
              {models.length - live.length} annihilated and no longer hirable.
            </p>
          )}
        </section>

        <section>
          <div className="label">Equipment</div>
          {equipment.length === 0
            ? <p className="note">None.</p>
            : (
              <ul className="hire__list">
                {equipment.map((e) => (
                  <li key={e.id}>
                    <span>{e.name}</span>
                    <span className="hire__paid">{e.page ? `p.${e.page}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}

          <div className="label" style={{ marginTop: 14 }}>Injuries</div>
          {activeInjuries.length === 0
            ? <p className="note">None.</p>
            : (
              <ul className="hire__list">
                {activeInjuries.map((i) => (
                  <li key={i.id}>
                    <span>{i.name}</span>
                    <span className="hire__paid">
                      {i.modelId
                        ? live.find((m) => m.id === i.modelId)?.name || 'a model'
                        : 'the leader'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

          {totem && (
            <>
              <div className="label" style={{ marginTop: 14 }}>Totem</div>
              <p className="note">
                {totem.name}
                {totem.advancements?.length > 0 && ` · ${totem.advancements.length} advancements`}
              </p>
            </>
          )}
        </section>
      </div>

      <p className="note shared__foot">
        Their arsenal as they last synced it. The encounter you can play against
        them is capped at the smaller of your two totals, plus six.
      </p>
    </article>
  )
}
