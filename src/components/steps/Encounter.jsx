import { useState } from 'react'
import { Label, Field, Button, Input, Select } from '../ui.jsx'
import {
  liveModels, liveEquipment, injuryCountForModel, injuriesFor, totalFor,
} from '../../lib/shape/arsenal.js'
import {
  openEncounter, hiredModels, hireCostOf, crewCost, encounterCap, encounterSizeOf,
  hiredEquipment, crewInjuryCount, crewRating, poolFor, encounterProblems,
  encounterReady, toggleModel, toggleTotem, toggleTax, attachEquipment,
  LEADER, TOTEM,
} from '../../lib/encounter.js'
import { arsenalTotal } from '../../lib/campaign.js'

/**
 * Hire a crew for this week's game, out of the arsenal (p. 19).
 *
 * Phase A of the crew builder: one side, on this device, kept on the player's
 * own campaign document so a closed tab loses nothing. It works offline (§6).
 * The opponent's numbers are typed, or read off the table's shared page when
 * the player sits at one. Phase B, the shared hidden-until-revealed session,
 * builds on this rather than replacing it.
 *
 * No Hank. Picking a crew is data entry, and he is silent through it (§3).
 * Everything that is a rule rather than a number is a `.gap-note`, so it shows
 * with the narration off (§5).
 *
 * The arithmetic is all in `lib/encounter.js`. This file only renders it.
 */
export default function Encounter({ campaign, arsenal, leader, membership, actions, onToTable }) {
  const encounter = openEncounter(campaign, arsenal.id)
  const [discarding, setDiscarding] = useState(false)

  if (!encounter) {
    return (
      <>
        <Field>
          <Label>Hire a crew</Label>
          <p className="note">
            Pick who goes to this week&rsquo;s game from your arsenal. Your leader
            and totem are free; everyone else costs what they cost. The app works
            out the encounter cap, your campaign rating and your starting pool,
            and hands them to the aftermath so you do not type them twice.
          </p>
        </Field>
        <Button onClick={() => actions.startEncounter()}>Start hiring</Button>
      </>
    )
  }

  const set = (patch) => actions.updateEncounter(encounter.id, patch)
  const setOpponent = (patch) => set((e) => ({ opponent: { ...e.opponent, ...patch } }))

  const models = liveModels(arsenal)
  const kit = liveEquipment(arsenal)
  const hired = hiredModels(encounter, arsenal)
  const cap = encounterCap(arsenal, encounter.opponent.arsenalTotal)
  const size = encounterSizeOf(encounter, arsenal)
  const spent = crewCost(encounter, arsenal)
  const rating = crewRating(encounter, arsenal)
  const pool = poolFor(encounter, arsenal)
  const problems = encounterProblems(encounter, arsenal)
  const ready = encounterReady(encounter, arsenal)
  const holderOf = new Map((encounter.equipment || []).map((x) => [x.rowId, x.holder]))
  const kitCount = hiredEquipment(encounter, arsenal).length

  // Everyone else at the table, read off the shared page. Totals are computed
  // from their live models, the same way `totalFor` does for this arsenal.
  const others = (membership?.arsenals || []).filter((a) => !a.isMine && !a.member?.isYou)
  const totalOf = (a) => arsenalTotal((a.models || []).filter((m) => !m.annihilated))
  const pickOpponent = (id) => {
    const a = others.find((x) => x.id === id)
    if (!a) { setOpponent({ arsenalId: null }); return }
    setOpponent({
      arsenalId: a.id,
      arsenalTotal: totalOf(a),
      name: a.member?.nickname || encounter.opponent.name || a.leader?.name || '',
    })
  }

  // Who can carry kit: the leader, the totem if it is coming, and every hired
  // model that is not a peon (p. 37).
  const holders = [
    { key: LEADER, label: leader.name || 'Your leader' },
    ...(encounter.totem && arsenal.totem ? [{ key: TOTEM, label: arsenal.totem.name || 'Totem' }] : []),
    ...hired.filter((m) => !m.peon).map((m) => ({ key: m.id, label: m.name })),
  ]

  return (
    <>
      <div className="hire__ledger">
        <span>encounter <strong>{size ?? '—'}</strong>{size != null && 'ss'}</span>
        <span>hired <strong>{spent}</strong>ss</span>
        {size != null && <span>left <strong>{Math.max(0, size - spent)}</strong></span>}
        <span>rating <strong>{rating}</strong></span>
        {pool && <span>pool <strong>{pool.total ?? `${pool.fromHire}+`}</strong></span>}
      </div>

      <Field>
        <Label>Who you are playing</Label>
        {others.length > 0 && (
          <Select value={encounter.opponent.arsenalId || ''} onChange={(e) => pickOpponent(e.target.value)}>
            <option value="">Someone not at this table, typed below</option>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.member?.nickname || 'unnamed player')} — {a.leader?.name || 'unnamed leader'} ({totalOf(a)}ss)
              </option>
            ))}
          </Select>
        )}
        <div className="grid3">
          <div>
            <span className="crew__sublabel">Name</span>
            <Input
              value={encounter.opponent.name}
              onChange={(e) => setOpponent({ name: e.target.value })}
              placeholder="Who you are playing"
              aria-label="Opponent"
            />
          </div>
          <div>
            <span className="crew__sublabel">Their arsenal, ss</span>
            <Input
              value={encounter.opponent.arsenalTotal ?? ''}
              onChange={(e) => setOpponent({ arsenalTotal: e.target.value === '' ? null : e.target.value, arsenalId: null })}
              inputMode="numeric"
              placeholder="e.g. 32"
              aria-label="Their arsenal total"
            />
          </div>
          <div>
            <span className="crew__sublabel">Their rating</span>
            <Input
              value={encounter.opponent.rating ?? ''}
              onChange={(e) => setOpponent({ rating: e.target.value === '' ? null : e.target.value })}
              inputMode="numeric"
              placeholder="once hired"
              aria-label="Their campaign rating"
            />
          </div>
        </div>
        <p className="note">
          Their arsenal total sets the cap. Their campaign rating, once they have
          hired, decides who gets the bonus soulstones. Both are on their arsenal
          sheet, which is public (p. 14).
        </p>
      </Field>

      <div className="grid2">
        <Field>
          <Label>Encounter size</Label>
          <Input
            value={encounter.encounterSize ?? ''}
            onChange={(e) => set({ encounterSize: e.target.value === '' ? null : e.target.value })}
            inputMode="numeric"
            placeholder={cap != null ? `${cap} — the cap` : 'soulstones'}
          />
          <p className="note">
            {cap != null
              ? `At most ${cap}ss: the smaller arsenal (yours is ${totalFor(arsenal)}ss) plus six. Leave it blank to play at the cap.`
              : `Capped at the smaller arsenal plus six. Yours is ${totalFor(arsenal)}ss; enter theirs to see the cap.`}
          </p>
        </Field>
        <Field>
          <Label>Strategy</Label>
          <Input value={encounter.strategy} onChange={(e) => set({ strategy: e.target.value })} />
        </Field>
      </div>

      <Field>
        <Label>Your crew</Label>
        <div className="picklist">
          <label className="hire__check">
            <input type="checkbox" checked disabled />
            {leader.name || 'Your leader'}
            <span className="hire__adj"> (leader, 0ss
              {injuriesFor(arsenal, {}).length > 0 && ` · ${injuriesFor(arsenal, {}).length} injured`})</span>
          </label>
          {arsenal.totem && (
            <label className="hire__check">
              <input type="checkbox" checked={encounter.totem} onChange={() => set(toggleTotem(encounter))} />
              {arsenal.totem.name || 'Totem'}
              <span className="hire__adj"> (totem, 0ss)</span>
            </label>
          )}
          {models.map((m) => {
            const on = encounter.modelIds.includes(m.id)
            const hurt = injuryCountForModel(arsenal, m)
            return (
              <div key={m.id} className="crew__row">
                <label className="hire__check">
                  <input type="checkbox" checked={on} onChange={() => set(toggleModel(encounter, m.id))} />
                  {m.name}
                  <span className="hire__adj">
                    {' '}({on ? hireCostOf(m, encounter) : m.cost}ss
                    {hurt > 0 && ` · ${hurt} injured`}
                    {m.peon && ' · peon'})
                  </span>
                </label>
                {on && (
                  <label className="hire__check crew__tax">
                    <input
                      type="checkbox"
                      checked={(encounter.taxed || []).includes(m.id)}
                      onChange={() => set(toggleTax(encounter, m.id))}
                    />
                    +1 out of keyword
                  </label>
                )}
              </div>
            )
          })}
          {models.length === 0 && <p className="note">Nothing in the arsenal but the leader.</p>}
        </div>
        <p className="gap-note">
          <strong>Out of keyword costs 1 more</strong>, as in any hire, unless the
          model is Versatile. The arsenal keeps only each model&rsquo;s name and
          cost, so tick the box for the models that pay it.
        </p>
      </Field>

      <Field>
        <Label>Equipment</Label>
        {kit.length === 0 ? (
          <p className="note">None in the arsenal yet. Barter is where it comes from.</p>
        ) : (
          <div className="picklist">
            {kit.map((e) => (
              <div key={e.id} className="crew__row">
                <span className="crew__kit">{e.name}{e.page ? <span className="hire__adj"> p.{e.page}</span> : null}</span>
                <Select
                  value={holders.some((h) => h.key === holderOf.get(e.id)) ? holderOf.get(e.id) : ''}
                  onChange={(ev) => set(attachEquipment(encounter, e.id, ev.target.value || null))}
                  aria-label={`Who carries ${e.name}`}
                >
                  <option value="">Left at camp</option>
                  {holders.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                </Select>
              </div>
            ))}
          </div>
        )}
        <p className="note">
          Attached free at hiring, and each piece taken adds 1 to your rating.
          Peons never carry equipment (p. 37).
        </p>
      </Field>

      <Field>
        <Label>Campaign rating — {rating}</Label>
        <div className="hire__breakdown">
          <span>equipment taken</span><span className="hire__adj">+{kitCount}</span>
          <span>leader advancements</span><span className="hire__adj">+{leader.advancements?.length || 0}</span>
          {encounter.totem && arsenal.totem && (
            <>
              <span>totem advancements</span>
              <span className="hire__adj">+{arsenal.totem.advancements?.length || 0}</span>
            </>
          )}
          <span>injuries in this crew</span><span className="hire__adj">−{crewInjuryCount(encounter, arsenal)}</span>
          <span className="hire__total">{rating}</span>
        </div>
        <p className="gap-note">
          <strong>Only the crew you hire counts.</strong> The book works the
          rating out &ldquo;after hiring and revealing crews&rdquo; (p. 19), so
          injuries on models left at camp, and a totem left at camp, do not count.
        </p>
      </Field>

      {pool && (
        <Field>
          <Label>Starting soulstone pool</Label>
          <div className="hire__breakdown">
            <span>left over from hiring</span><span className="hire__adj">{pool.leftover}</span>
            <span>into the pool, at most 6</span><span className="hire__adj">{pool.fromHire}</span>
            <span>lower rating&rsquo;s bonus, at most 3</span>
            <span className="hire__adj">{pool.bonus == null ? '?' : `+${pool.bonus}`}</span>
            <span className="hire__total">{pool.total ?? `${pool.fromHire} + ?`}</span>
          </div>
          {pool.bonus == null && (
            <p className="note">Enter their rating once they have hired to see the bonus.</p>
          )}
          {pool.lostOverMax > 0 && (
            <p className="note">
              {pool.lostOverMax} soulstone{pool.lostOverMax === 1 ? '' : 's'} over
              the pool&rsquo;s six {pool.lostOverMax === 1 ? 'is' : 'are'} lost.
              Excess hiring stones go to the pool, never to scrip.
            </p>
          )}
        </Field>
      )}

      {problems.length > 0 && (
        <div className="gap-note">
          <strong>Not ready yet.</strong>
          <ul className="crew__problems">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="export">
        <Button onClick={onToTable} disabled={!ready}>
          Played it — record the game
        </Button>
        {discarding ? (
          <>
            <Button ghost onClick={() => { actions.discardEncounter(encounter.id); setDiscarding(false) }}>
              Yes, throw this crew away
            </Button>
            <Button ghost onClick={() => setDiscarding(false)}>Keep it</Button>
          </>
        ) : (
          <Button ghost onClick={() => setDiscarding(true)}>Start over</Button>
        )}
      </div>
      {!ready && size == null && (
        <p className="note">
          Enter their arsenal total, or an agreed encounter size, to finish.
        </p>
      )}
    </>
  )
}
