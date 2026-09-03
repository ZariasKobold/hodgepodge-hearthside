import { useState, useMemo } from 'react'
import { hireCost, FIRST_HIRE_DISCOUNT, OUT_OF_KEYWORD_SURCHARGE } from '../../lib/campaign.js'
import {
  isOutOfKeyword, hiresInWeek,
} from '../../lib/shape/arsenal.js'
import {
  hireRules,
} from '../../lib/shape/campaign.js'
import { isVersatile as versatileModel } from '../../lib/indexing.js'
import { factionLabel } from '../../data/factions.js'
import { Label, Field, Button, Input, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import { hireGreeting, hireReaction, hireCantAfford, hireDone } from '../../data/hank.js'

/**
 * The weekly hire.
 *
 * Split into two moments because of the timing rule (CLAUDE.md §2): on arrival
 * the app knows the week and the scrip on hand and nothing else, so the
 * greeting can only speak to those. The reaction waits until a model is chosen,
 * because until then there is no cost to react to.
 *
 * Selection degrades: if the register loaded, pick from it; if it didn't, type
 * a name and cost. The arithmetic is identical either way, which is the whole
 * reason cost ceilings live in `lib/` rather than in a component.
 */
export default function WeeklyHire({ arsenal, week, houseRules, mustHire, roster, onHire }) {
  const [slug, setSlug] = useState('')
  const [manual, setManual] = useState({ name: '', cost: '' })
  // Tri-state on purpose: null follows the register, true/false is the player
  // overriding it. A plain boolean ORed with detection made the checkbox
  // unclickable in the one case that matters — a model the register already
  // calls Versatile, where unticking silently did nothing.
  const [versatileOverride, setVersatileOverride] = useState(null)

  // Totems are absent from both pools and that is not an oversight: `useRoster`
  // never collects one, because a totem comes from the tier-3 advancement table
  // and nowhere else (p.52). See `isSelectionSource`.
  //
  // Split so a Versatile model showing up outside your keywords reads as a
  // rule rather than a bug. Both are equally hirable; only the surcharge differs.
  // The partition is on the characteristic alone, deliberately: Versatile names
  // what a model *is*, so a Versatile model that also shares your keyword stays
  // under Versatile rather than moving between groups depending on who declared
  // what. The surcharge asks its own question and is unaffected — owner
  // decision, v0.16.0.
  // Sorted by cost and labelled in soulstones, matching the creation step's
  // picker. The two disagreed — one sorted and wrote "5ss", the other did
  // neither — which made the same list read differently on two screens
  // (audit L7).
  const byCost = (models) => [...models].sort((a, b) => a.cost - b.cost)
  const versatilePool = useMemo(() => byCost(roster.models.filter(versatileModel)), [roster.models])
  const keywordPool = useMemo(() => byCost(roster.models.filter((m) => !versatileModel(m))), [roster.models])

  const hiredThisWeek = hiresInWeek(arsenal, week)
  const isFirstOfWeek = hiredThisWeek.length === 0

  const picked = useMemo(() => {
    if (slug) return roster.models.find((m) => m.slug === slug) || null
    const cost = Number(manual.cost)
    if (!manual.name.trim() || !Number.isFinite(cost) || manual.cost === '') return null
    return { slug: null, name: manual.name.trim(), cost, keywords: [], characteristics: [] }
  }, [slug, manual, roster.models])

  // The faction index carries `characteristics`, so this is now read rather
  // than guessed — but it stays overridable, because a hand-typed hire has no
  // characteristics at all and the player is the one holding the card.
  const detectedVersatile = versatileModel(picked)
  const isVersatile = versatileOverride ?? detectedVersatile
  const outOfKeyword = picked ? isOutOfKeyword(picked, arsenal.keywords) : false

  const cost = picked
    ? hireCost(picked, { isFirstOfWeek, outOfKeyword, isVersatile }, hireRules(houseRules))
    : null

  const affordable = cost == null || cost <= arsenal.scrip
  const surcharged = outOfKeyword && !isVersatile

  function confirm() {
    if (!picked || !affordable) return
    // Four fields, the same four `Record` writes for the starting arsenal.
    // Passing `picked` whole put the entire register record — actions,
    // triggers, abilities, characteristics — into the stored campaign, into
    // every sync push and into the JSON export, and left two different shapes
    // in the arsenal again (audit v0.11.0, M1).
    onHire({ slug: picked.slug, name: picked.name, cost: picked.cost }, cost)
    setSlug('')
    setManual({ name: '', cost: '' })
    setVersatileOverride(null)
  }

  return (
    <>
      <HankSays>{hireGreeting({ week, scrip: arsenal.scrip })}</HankSays>

      <div className="hire__ledger">
        <span><strong>{arsenal.scrip}</strong> scrip</span>
        <span>week <strong>{week}</strong></span>
        <span>
          {hiredThisWeek.length
            ? `${hiredThisWeek.length} hired this week`
            : mustHire ? 'none hired yet' : 'no hire required'}
        </span>
      </div>

      {mustHire && isFirstOfWeek && (
        <p className="note note--warn">
          A hire is mandatory this week. Every player adds at least one model
          each week after the first.
        </p>
      )}

      {/* Rules gap. Uses .gap-note, never HankSays — someone who switched the
          narration off still has to know the app floored a negative to zero
          (CLAUDE.md §5, §13). */}
      <p className="gap-note">
        <strong>House rule in force.</strong> The first model each week costs{' '}
        {FIRST_HIRE_DISCOUNT} less scrip, which can compute below zero — a
        3-cost first hire works out to −2. The book never says what happens, and
        paying the difference out would make cheap models an endless source of
        scrip. This app <strong>floors the price at zero</strong> and applies the
        out-of-keyword surcharge <strong>before</strong> the discount. Both are
        adjustable house rules if your group reads it differently.
      </p>

      <Field>
        <Label>Model to hire</Label>
        {roster.models.length > 0 ? (
          <Select value={slug} onChange={(e) => { setSlug(e.target.value); setVersatileOverride(null) }}>
            <option value="">Choose from the register…</option>
            <optgroup label="From your keywords">
              {keywordPool.map((m) => (
                <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
              ))}
            </optgroup>
            {versatilePool.length > 0 && (
              <optgroup label={`Versatile — ${factionLabel(arsenal.faction)}`}>
                {versatilePool.map((m) => (
                  <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
                ))}
              </optgroup>
            )}
          </Select>
        ) : (
          <>
            {/* The campaign view is reachable without ever visiting the
                creation wizard, so the register has to be loadable from here
                too — otherwise the Versatile pool is unreachable for anyone
                resuming a campaign. */}
            <div className="crew__bar">
              <Button
                onClick={() => roster.load({ keywords: arsenal.keywords, faction: arsenal.faction })}
                disabled={roster.loading}
              >
                {roster.loading ? 'Reading…' : 'Load models from the register'}
              </Button>
              <span className={`label${roster.error ? ' note--warn' : ''}`} style={{ margin: 0 }}>
                {roster.loading && roster.progress
                  ? `Reading ${roster.progress.keyword} — ${roster.progress.done} of ${roster.progress.total}…`
                  : roster.error || 'Or type the hire by hand below — the arithmetic is the same.'}
              </span>
            </div>
          </>
        )}
      </Field>

      {!slug && (
        <Field>
          <Label>{roster.models.length ? 'Or record it by hand' : 'Name and cost'}</Label>
          <div className="hire__manual">
            <Input
              value={manual.name}
              onChange={(e) => setManual({ ...manual, name: e.target.value })}
              placeholder="Model name"
            />
            <Input
              value={manual.cost}
              onChange={(e) => setManual({ ...manual, cost: e.target.value })}
              placeholder="Cost"
              inputMode="numeric"
            />
          </div>
        </Field>
      )}

      {picked && (
        <div className="hire__quote">
          <div className="hire__breakdown">
            <span>{picked.name}</span>
            <span>{picked.cost}</span>
            {surcharged && <span className="hire__adj">+{OUT_OF_KEYWORD_SURCHARGE} out of keyword</span>}
            {isFirstOfWeek && <span className="hire__adj">−{FIRST_HIRE_DISCOUNT} first hire of the week</span>}
            <span className="hire__total">{cost} scrip</span>
          </div>

          {outOfKeyword && (
            <label className="hire__check">
              <input
                type="checkbox"
                checked={isVersatile}
                onChange={(e) => setVersatileOverride(e.target.checked)}
              />
              This model is Versatile — no out-of-keyword surcharge
              {detectedVersatile && <span className="hire__adj"> (the register says so)</span>}
            </label>
          )}

          {cost === 0 && isFirstOfWeek && picked.cost < FIRST_HIRE_DISCOUNT && (
            <p className="gap-note">
              <strong>Floored.</strong> {picked.name} costs {picked.cost}, so the
              discount would have taken this to{' '}
              {picked.cost + (surcharged ? OUT_OF_KEYWORD_SURCHARGE : 0) - FIRST_HIRE_DISCOUNT}.
              You pay nothing rather than being paid.
            </p>
          )}

          <HankSays>
            {affordable
              ? hireReaction({ week, isFirstOfWeek, outOfKeyword: surcharged, cost })
              : hireCantAfford({ week })}
          </HankSays>

          {!affordable && (
            <p className="note note--warn">
              That costs {cost} and you hold {arsenal.scrip}.
            </p>
          )}

          <Button onClick={confirm} disabled={!affordable}>
            Hire for {cost}
          </Button>
        </div>
      )}

      {hiredThisWeek.length > 0 && (
        <Field>
          <Label>Hired in week {week}</Label>
          <ul className="hire__list">
            {hiredThisWeek.map((m) => (
              <li key={m.id}>
                <span>{m.name}</span>
                <span className="hire__paid">{m.scripPaid} scrip</span>
              </li>
            ))}
          </ul>
          <HankSays>{hireDone({ week })}</HankSays>
        </Field>
      )}
    </>
  )
}
