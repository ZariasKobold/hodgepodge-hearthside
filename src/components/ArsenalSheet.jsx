import { SLOTS } from '../data/archetypes.js'
import { getEffect } from '../data/crewCards.js'
import { factionLabel } from '../data/factions.js'
import {
  totalFor, liveModels, activeInjuryCount, injuriesFor, standingRating, gamesWon,
} from '../lib/campaignShape.js'
import { EXPERIENCE_TRACK } from '../data/advancements.js'
import { sourceSlug, findEntry, actionColumns } from '../lib/rules.js'
import { PrintLegal } from './ui.jsx'

/**
 * The arsenal sheet — everything the official one records, in this app's own
 * hand.
 *
 * Deliberately **not** a facsimile. CLAUDE.md §8 bars copying Wyrd's trade
 * dress, and the fan policy that permits this whole project is revocable; a
 * look-alike is the one thing that section names. So the *fields* are matched
 * exactly — a player who knows the real sheet finds everything where they
 * expect it — while the type, palette and rules are the records-office ones
 * used everywhere else here.
 *
 * Two page-equivalents, matching the official two:
 *
 *   1. The crew: identity, tallies, equipment, roster with injuries, crew card,
 *      leadership experience.
 *   2. The stat cards: the leader, and a totem card.
 *
 * ## Filled and blank
 *
 * Anything the app tracks is printed. Anything it does not is ruled and left
 * empty on purpose, so the sheet is usable at a table with a pencil rather than
 * being useless until every feature exists.
 *
 * The six sections that were ruled-and-blank until the aftermath existed —
 * games won, crew rating, equipment, per-model injuries, the experience track
 * and the totem — are filled now that something produces them. What is still
 * left to the pencil is deliberate: the equipment half of the campaign rating,
 * which counts kit *hired for a game* and so has no value between games, and
 * the totem's actions, which come off a card this app does not store (§4).
 */

const EQUIPMENT_SLOTS = 10
const CREW_SLOTS = 12

/* The experience track moved to `data/advancements.js`, beside the flow that
   walks it. The copy that used to live here had rows two and three wrong —
   transcribed rather than read off the printed track — and two copies of one
   table is how a mistake like that survives eight versions unnoticed. */

function Field({ label, value, wide, children }) {
  return (
    <div className={`sheet__field${wide ? ' sheet__field--wide' : ''}`}>
      <div className="sheet__field-k">{label}</div>
      <div className="sheet__field-v">{children ?? (value || ' ')}</div>
    </div>
  )
}

/**
 * `sub` is a column heading repeated down every rule, the way the printed sheet
 * does it; `subs` fills that column per row wherever the app knows the answer.
 * A filled row drops the heading — printing "Injuries" beside "Severe
 * Amputation" would read as a second injury.
 */
function Ruled({ n, values = [], numbered = true, sub, subs = [] }) {
  return (
    <ol className="sheet__ruled">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="sheet__ruled-row">
          {numbered && <span className="sheet__ruled-n">{i + 1}.</span>}
          <span className="sheet__ruled-v">{values[i] || ' '}</span>
          {(sub || subs[i]) && (
            <span className={`sheet__ruled-sub${subs[i] ? ' sheet__ruled-sub--filled' : ''}`}>
              {subs[i] || sub}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

/** Wounds are counted from zero up, so the track starts at 0 and runs to health. */
function HealthTrack({ health }) {
  if (!health) return null
  return (
    <div className="sheet__wounds">
      <span className="sheet__wounds-zero">0</span>
      {Array.from({ length: health }, (_, i) => (
        <span className="sheet__wound" key={i} />
      ))}
    </div>
  )
}

function ActionsTable({ rows }) {
  return (
    <table className="sheet__actions">
      <thead>
        <tr>
          <th className="sheet__actions-name">Name</th>
          <th>Rg</th><th>Skl</th><th>Rst</th><th>TN</th><th>Dmg</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key || i}>
            <td className="sheet__actions-name">{r.name || ' '}</td>
            <td>{r.rg}</td><td>{r.skl}</td><td>{r.rst}</td><td>{r.tn}</td><td>{r.dmg}</td>
          </tr>
        ))}
        {/* Ruled remainder, so there is room to write in what is earned later. */}
        {Array.from({ length: Math.max(0, 10 - rows.length) }, (_, i) => (
          <tr key={`blank-${i}`}>
            <td className="sheet__actions-name">&nbsp;</td>
            <td /><td /><td /><td /><td />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function ArsenalSheet({ arsenal, leader, archetype, campaign, rules }) {
  const effect = getEffect(leader.crewCard.effect)
  const models = liveModels(arsenal)
  const keywords = (arsenal.keywords || []).filter(Boolean)

  // Actions come from the picks, resolved through the live register for their
  // Rg/Skl/Rst/TN/Dmg. Absent text simply leaves the columns blank.
  const actionRows = []
  for (const slot of ['attack', 'tactical']) {
    for (const pick of leader.picks[slot] || []) {
      const slug = sourceSlug(pick)
      const card = slug ? rules.card(slug) : null
      const entry = card ? findEntry(card, slot, pick.name) : null
      actionRows.push({ key: pick.key, name: pick.name, ...actionColumns(entry) })
    }
  }

  const abilityNames = (leader.picks.ability || []).map((p) => p.name)
  const won = campaign ? gamesWon(campaign, arsenal.id) : 0
  const equipment = arsenal.equipment || []
  const totem = arsenal.totem
  const boxesChecked = leader.experience?.boxesChecked || 0
  const leaderAdvancements = leader.advancements || []
  const totemAdvancements = totem?.advancements || []

  // Injuries print against the model carrying them, which is what the official
  // sheet's second column beside each crew line is for.
  const injuryFor = (m) =>
    injuriesFor(arsenal, m.titleGroup ? { titleGroup: m.titleGroup } : { modelId: m.id })
      .map((i) => i.name).join(', ')
  const leaderInjuries = injuriesFor(arsenal, {}).map((i) => i.name)

  return (
    <div className="sheet">
      {/* ── page one — the crew ─────────────────────────────────── */}
      <article className="sheet__page">
        <header className="sheet__head">
          <div className="sheet__head-id">
            {leader.portrait && (
              <img className="sheet__portrait" src={leader.portrait} alt="" />
            )}
            <div>
              <div className="sheet__eyebrow">Malifaux Fourth Edition · campaign</div>
              <h1 className="sheet__title">Arsenal Sheet</h1>
            </div>
          </div>
          <div className="sheet__tallies">
            <Field label="Games won" value={won || ' '} />
            {/* The rating counts equipment *hired for a game*, which cannot be
                known between games — so the standing part is printed and the
                rest is left to the pencil, which is what the printed box was
                always asking for. */}
            <Field label="Crew rating" value={`${standingRating(arsenal)} + kit hired`} />
            <Field label="Scrip" value={arsenal.scrip} />
          </div>
        </header>

        <div className="sheet__identity">
          <Field label="Crew name" value={leader.name} wide />
          <Field label="Faction" value={factionLabel(arsenal.faction)} wide />
        </div>
        <Field label="Keywords" value={keywords.join(' · ')} wide />

        <div className="sheet__cols">
          <section>
            <h2 className="sheet__h2">Equipment</h2>
            <Ruled
              n={Math.max(EQUIPMENT_SLOTS, equipment.length)}
              values={equipment.map((e) => `${e.name}${e.page ? ` — p.${e.page}` : ''}`)}
            />

            <h2 className="sheet__h2">Crew</h2>
            <Ruled
              n={Math.max(CREW_SLOTS, models.length)}
              values={models.map((m) => `${m.name}${m.cost ? ` — ${m.cost}ss` : ''}`)}
              subs={models.map(injuryFor)}
              sub="Injuries"
            />
            <div className="sheet__note">
              {models.length} in the arsenal · {totalFor(arsenal)}ss
              {activeInjuryCount(arsenal) > 0 && ` · ${activeInjuryCount(arsenal)} injuries`}
            </div>
          </section>

          <section>
            <h2 className="sheet__h2">Crew card</h2>
            <div className="sheet__card">
              <Field
                label="Card name"
                value={effect ? `${effect.name}${leader.crewCard.choice ? ` — ${leader.crewCard.choice}` : ''}` : ''}
                wide
              />
              {/* The effect's text is book content this app deliberately does
                  not store (§4), so the lines are left for the player. */}
              <div className="sheet__lines">
                {Array.from({ length: 14 }, (_, i) => <span key={i} />)}
              </div>
              {effect && <div className="sheet__note">Index of the Untold, p.{effect.page}</div>}
            </div>
          </section>
        </div>

        <section>
          <h2 className="sheet__h2">Leadership experience</h2>
          <div className="sheet__xp">
            {EXPERIENCE_TRACK.map((row, r) => (
              <div className="sheet__xp-row" key={r}>
                {row.map((n, c) => {
                  const i = r * row.length + c
                  return (
                    <span
                      className={`sheet__xp-box${i < boxesChecked ? ' sheet__xp-box--on' : ''}`}
                      key={c}
                    >
                      {n ?? ''}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="sheet__note">
            {boxesChecked} of {EXPERIENCE_TRACK.flat().length} marked. A number
            grants an advancement from a table of that tier or lower.
          </div>

          {leaderAdvancements.length > 0 && (
            <>
              <h3 className="sheet__h3">Advancements</h3>
              <Ruled
                n={Math.max(6, leaderAdvancements.length)}
                values={leaderAdvancements.map(
                  (adv) => `${adv.name} — ${adv.tableName}${adv.page ? `, p.${adv.page}` : ''}`
                )}
              />
            </>
          )}

          {(arsenal.crewCardAdvancements || []).length > 0 && (
            <>
              <h3 className="sheet__h3">Crew card additions</h3>
              <Ruled
                n={arsenal.crewCardAdvancements.length}
                values={arsenal.crewCardAdvancements.map((adv) => adv.name)}
              />
            </>
          )}
        </section>

        <div className="sheet__foot">
          Rules text lives on your cards. Action values are read live from
          BiggerHat and are not stored by this app.
          <PrintLegal />
        </div>
      </article>

      {/* ── page two — the stat cards ───────────────────────────── */}
      <article className="sheet__page sheet__page--break">
        <h2 className="sheet__h2">Master stat card</h2>

        <div className="sheet__paths">
          <span className={`sheet__check${leader.advancementPath === 'bruiser' ? ' sheet__check--on' : ''}`}>
            Bruiser
          </span>
          <span className={`sheet__check${leader.advancementPath === 'strategist' ? ' sheet__check--on' : ''}`}>
            Strategist
          </span>
          <span className={`sheet__check${leader.miraculousRecoveryUsed ? ' sheet__check--on' : ''}`}>
            Miraculous Recovery used
          </span>
        </div>

        <div className="sheet__cols">
          <section>
            <Field label="Master name & title" value={leader.name} wide />
            <Field label="Keyword(s)" value={keywords.join(' · ')} wide />
            <Field label="Characteristic(s)" value={[...leader.characteristics, 'Master'].join(', ')} wide />
            <div className="sheet__identity">
              <Field label="Faction" value={factionLabel(arsenal.faction)} />
              <Field label="Cost" value="—" />
            </div>
            <div className="sheet__identity">
              <Field label="Crew card" value={effect?.name || ''} />
              <Field label="Totem" value={totem?.name || ''} />
            </div>

            <div className="sheet__stats">
              {[['Df', archetype.stats.df], ['Wp', archetype.stats.wp],
                ['Sp', archetype.stats.sp], ['Sz', leader.size]].map(([k, v]) => (
                <div className="sheet__stat" key={k}>
                  <span className="sheet__stat-k">{k}</span>
                  <span className="sheet__stat-v">{v}</span>
                </div>
              ))}
            </div>

            <h3 className="sheet__h3">Abilities</h3>
            <Ruled n={Math.max(6, abilityNames.length)} values={abilityNames} numbered={false} />

            <HealthTrack health={archetype.stats.health} />
            <div className="sheet__note">Base {leader.base}mm · Health {archetype.stats.health}</div>
            {leaderInjuries.length > 0 && (
              <div className="sheet__note">Injuries — {leaderInjuries.join(', ')}</div>
            )}
          </section>

          <section>
            <h3 className="sheet__h3">Actions</h3>
            <ActionsTable rows={actionRows} />
            {leader.trigger && (
              <div className="sheet__note">Trigger — {leader.trigger}</div>
            )}
          </section>
        </div>

        <h2 className="sheet__h2 sheet__h2--spaced">Totem stat card</h2>
        {/* Filled once a tier-3 advancement grants a totem, ruled and blank
            until then — the official sheet has the card either way, and a
            player who gains one mid-evening needs somewhere to write it. Its
            keywords are the leader's by rule, so they are printed from the
            arsenal rather than stored a second time. */}
        <div className="sheet__cols">
          <section>
            <Field label="Totem name" value={totem?.name || ''} wide />
            <Field label="Keyword(s)" value={totem ? keywords.join(' · ') : ''} wide />
            <Field
              label="Characteristic(s)"
              value={totem ? [...(totem.characteristics || []), 'Totem'].join(', ') : ''}
              wide
            />
            <div className="sheet__identity">
              <Field label="Faction" value={totem ? factionLabel(arsenal.faction) : ''} />
              <Field label="Cost" value={totem ? '—' : ''} />
            </div>
            <div className="sheet__stats">
              {[['Df', totem?.stats.df], ['Wp', totem?.stats.wp],
                ['Sp', totem?.stats.sp], ['Sz', totem?.size]].map(([k, v]) => (
                <div className="sheet__stat" key={k}>
                  <span className="sheet__stat-k">{k}</span>
                  <span className="sheet__stat-v">{v ?? ' '}</span>
                </div>
              ))}
            </div>
            <h3 className="sheet__h3">Abilities</h3>
            <Ruled
              n={Math.max(6, totemAdvancements.length)}
              values={totemAdvancements.map((a) => `${a.name} — ${a.tableName}`)}
              numbered={false}
            />
            {totem && (
              <>
                <HealthTrack health={totem.stats.health} />
                <div className="sheet__note">
                  Base {totem.base}mm · Health {totem.stats.health}
                  {totem.tableValue != null && ` · totem table ${totem.tableValue}, p.52`}
                </div>
              </>
            )}
          </section>
          <section>
            <h3 className="sheet__h3">Actions</h3>
            <ActionsTable rows={[]} />
          </section>
        </div>

        <div className="sheet__foot">
          <PrintLegal />
        </div>
      </article>
    </div>
  )
}
