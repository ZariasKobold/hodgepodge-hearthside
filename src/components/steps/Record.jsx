import { useState, useMemo } from 'react'
import { SLOTS, slotLabel } from '../../data/archetypes.js'
import { getEffect } from '../../data/crewCards.js'
import { factionLabel } from '../../data/factions.js'
import { startingScrip, STARTING_SOULSTONES } from '../../lib/campaign.js'
import {
  createModel, STARTING_ARSENAL_WEEK, startingArsenalSpend,
} from '../../lib/shape/arsenal.js'
import { exportJSON } from '../../lib/storage.js'
import { isVersatile } from '../../lib/indexing.js'
import { buildSheet, sheetToPNG, printSheet } from '../../lib/recordImage.js'
import { Label, Button, Select } from '../ui.jsx'
import LeaderRecord from '../LeaderRecord.jsx'
import CrewCards from '../CrewCards.jsx'
import HankSays from '../HankSays.jsx'
import { CREATION, sendOff } from '../../data/hank.js'

/** Cheapest first, so the picker reads as a shopping list. */
const byCost = (models) => [...models].sort((a, b) => a.cost - b.cost)

/**
 * The last step of creation: read the finished record, then spend the 25
 * soulstones on a starting arsenal.
 *
 * The record itself is `LeaderRecord`, shared with the standing arsenal view so
 * the two cannot drift into different documents.
 */
export default function Record({
  campaign, leader, set, archetype, roster, rules, fileNumber,
  owedStartingScrip = 0, onCreditStartingScrip, onDone,
}) {
  // Week 0 only. This used to total the whole roster, which is the same number
  // during creation and quietly wrong afterwards: opening this screen in week
  // three read a 40ss roster as the starting arsenal, so the grant computed to
  // zero and the tally claimed you had no starting scrip.
  //
  // Annihilated models still count — the soulstones were spent, and a model
  // dying in week four does not make the starting arsenal retroactively
  // cheaper. That is why this is not `liveModels` (cf. audit L10, which was
  // about the *arsenal total*, a different number with the opposite need).
  const spent = startingArsenalSpend({ models: leader.arsenal })
  const scrip = startingScrip(spent)
  const over = spent > STARTING_SOULSTONES
  const effect = getEffect(leader.crewCard.effect)
  const [imaging, setImaging] = useState(null)

  // Versatile models are hirable without sharing a keyword, so the picker
  // separates them. `isVersatile` is derived, never stored — the register owns
  // that fact and may change it.
  const versatileModels = useMemo(() => roster.models.filter(isVersatile), [roster.models])
  const keywordModels = useMemo(() => roster.models.filter((m) => !isVersatile(m)), [roster.models])

  const stem = (leader.name || 'leader').toLowerCase().replace(/\s+/g, '-')

  /**
   * Goes through `createModel` like every other hire. Writing a bare
   * `{slug,name,cost}` here left starting models without an `id`, and injuries,
   * annihilation and removal all key off `id` (audit M1). Week 0 keeps the
   * starting arsenal out of `hiresInWeek`, so it is never mistaken for hires.
   */
  const addModel = (slug) => {
    const model = roster.models.find((m) => m.slug === slug)
    if (!model) return
    set({
      arsenal: [
        ...leader.arsenal,
        createModel({
          slug: model.slug,
          name: model.name,
          cost: model.cost,
          addedWeek: STARTING_ARSENAL_WEEK,
        }),
      ],
    })
  }

  const dropModel = (index) =>
    set({ arsenal: leader.arsenal.filter((_, i) => i !== index) })

  /** Built at the moment of export so it always reflects what has arrived. */
  const saveImage = async () => {
    setImaging('working')
    try {
      await sheetToPNG(
        buildSheet({
          leader,
          archetype,
          factionLabel: factionLabel(leader.faction),
          fileNumber,
          slots: SLOTS,
          slotLabel,
          effect,
          cardFor: rules.card,
        }),
        `${stem}.png`
      )
      setImaging(null)
    } catch (err) {
      setImaging(String(err.message || err))
    }
  }

  return (
    <>
      <LeaderRecord leader={leader} archetype={archetype} fileNumber={fileNumber} rules={rules} />

      <div className="export noprint">
        {/* The campaign, not the flat wizard adapter — see audit v0.11.0 H2. */}
        <Button ghost onClick={() => exportJSON(campaign, `${stem}.json`)}>Export JSON</Button>
        <Button ghost onClick={saveImage} disabled={imaging === 'working'}>
          {imaging === 'working' ? 'Drawing…' : 'Export image'}
        </Button>
        <Button ghost onClick={printSheet}>Export PDF</Button>
        <span className="label" style={{ margin: 0 }}>
          PDF opens your print dialogue — choose “Save as PDF”.
        </span>
      </div>
      {imaging && imaging !== 'working' && <p className="note note--warn noprint">{imaging}</p>}

      <section style={{ marginTop: 28 }} className="noprint">
        <HankSays>{CREATION.arsenal}</HankSays>
        <div className="slot__head">
          <Label>Starting arsenal — {STARTING_SOULSTONES} soulstones, leader costs nothing</Label>
          <span className={`tally${over ? ' tally--over' : ''}`}>
            {spent}/{STARTING_SOULSTONES} spent · {scrip} scrip
          </span>
        </div>

        {leader.arsenal.map((m, i) => (
          <div
            className="pick"
            key={m.id || `${m.slug}-${i}`}
            style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}
          >
            <span className="pick__meta" style={{ fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="pick__meta">{m.cost}ss</span>
              <button className="pick__drop" onClick={() => dropModel(i)}>REMOVE</button>
            </span>
          </div>
        ))}

        {roster.models.length > 0 ? (
          <Select value="" onChange={(e) => addModel(e.target.value)} style={{ marginTop: 8 }}>
            <option value="">Add a model…</option>
            {/* Grouped rather than merged, so a Versatile model appearing
                alongside your keyword models reads as a rule rather than a
                bug. Both groups are equally hirable. */}
            <optgroup label="From your keywords">
              {byCost(keywordModels).map((m) => (
                <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
              ))}
            </optgroup>
            {versatileModels.length > 0 && (
              <optgroup label={`Versatile — ${factionLabel(leader.faction)}`}>
                {byCost(versatileModels).map((m) => (
                  <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
                ))}
              </optgroup>
            )}
          </Select>
        ) : (
          <div className="empty" style={{ marginTop: 8 }}>
            Load the register on the loadout step to hire from your keywords and
            your faction's Versatile models.
          </div>
        )}

        {over && (
          <p className="note note--warn">
            Over budget by {spent - STARTING_SOULSTONES}ss. Drop something before the first game.
          </p>
        )}

        {/* An arsenal built before v0.19.1 was shown this number and never paid
            it. Offered rather than applied on load: moving the scrip on a
            campaign in progress without saying so is indistinguishable from a
            bug, and there are other people's campaigns on the database now. */}
        {owedStartingScrip > 0 && onCreditStartingScrip && (
          <p className="note note--warn">
            <strong>This arsenal is owed {owedStartingScrip} scrip.</strong>{' '}
            Each starting soulstone you chose not to spend becomes one scrip, up
            to three (p.&nbsp;15). This screen has shown that number since the
            first version and never paid it into the arsenal — fixed now, but
            yours predates the fix, so it is offered rather than moved for you.
            {' '}
            <Button onClick={onCreditStartingScrip}>
              Credit {owedStartingScrip} scrip
            </Button>
          </p>
        )}
      </section>

      {leader.arsenal.length > 0 && <CrewCards models={leader.arsenal} rules={rules} />}

      <HankSays>{sendOff({})}</HankSays>

      {/* Everything already autosaves, so this does not "save" so much as
          declare you are finished and hand over the standing view. */}
      {onDone && (
        <div className="export noprint">
          <Button onClick={onDone}>Done — view the arsenal</Button>
          <span className="label" style={{ margin: 0 }}>
            Saved to this browser as you go. Export the JSON to keep a copy elsewhere.
          </span>
        </div>
      )}
    </>
  )
}
