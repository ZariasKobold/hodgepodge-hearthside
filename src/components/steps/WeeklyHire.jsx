import { useState, useMemo } from 'react'
import { hireCost, FIRST_HIRE_DISCOUNT, OUT_OF_KEYWORD_SURCHARGE } from '../../lib/campaign.js'
import { hireRules, isOutOfKeyword, hiresInWeek } from '../../lib/campaignShape.js'
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
  const [versatile, setVersatile] = useState(false)

  const hiredThisWeek = hiresInWeek(arsenal, week)
  const isFirstOfWeek = hiredThisWeek.length === 0

  const picked = useMemo(() => {
    if (slug) return roster.models.find((m) => m.slug === slug) || null
    const cost = Number(manual.cost)
    if (!manual.name.trim() || !Number.isFinite(cost) || manual.cost === '') return null
    return { slug: null, name: manual.name.trim(), cost, keywords: [], characteristics: [] }
  }, [slug, manual, roster.models])

  // The register may not carry Versatile reliably, so detection is a starting
  // point the player can override rather than a fact we assert.
  const detectedVersatile = Boolean(
    picked?.characteristics?.some((c) => String(c).toLowerCase() === 'versatile')
  )
  const isVersatile = versatile || detectedVersatile
  const outOfKeyword = picked ? isOutOfKeyword(picked, arsenal.keywords) : false

  const cost = picked
    ? hireCost(picked, { isFirstOfWeek, outOfKeyword, isVersatile }, hireRules(houseRules))
    : null

  const affordable = cost == null || cost <= arsenal.scrip
  const surcharged = outOfKeyword && !isVersatile

  function confirm() {
    if (!picked || !affordable) return
    onHire(picked, cost)
    setSlug('')
    setManual({ name: '', cost: '' })
    setVersatile(false)
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
          <Select value={slug} onChange={(e) => { setSlug(e.target.value); setVersatile(false) }}>
            <option value="">Choose from the register…</option>
            {roster.models.map((m) => (
              <option key={m.slug} value={m.slug}>{m.name} — {m.cost}</option>
            ))}
          </Select>
        ) : (
          <p className="note">
            The register isn't loaded, so type the hire by hand. The arithmetic
            is the same either way.
          </p>
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
                onChange={(e) => setVersatile(e.target.checked)}
              />
              This model is Versatile — no out-of-keyword surcharge
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
