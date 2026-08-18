import { SLOTS } from '../../data/archetypes.js'
import { CREW_CARD_EFFECTS, getEffect } from '../../data/crewCards.js'
import { availableTriggers } from '../../lib/validation.js'
import { Label, Field, Button, Chip, Input, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import { CREATION, selectGreeting, selectOffline, selectTrigger, selectDone } from '../../data/hank.js'
import SelectionSlot from '../SelectionSlot.jsx'

export default function Loadout({ leader, set, setPick, archetype, roster }) {
  const { models, loading, progress, error, loadKeywords } = roster
  const triggers = availableTriggers(leader.picks)
  const effect = getEffect(leader.crewCard.effect)

  const statusLine = loading
    ? progress
      ? `Reading ${progress.keyword} — ${progress.done} of ${progress.total}…`
      : 'Reading the register…'
    : error
      ? error
      : models.length
        ? `${models.length} eligible models on file.`
        : ''

  const allFilled = SLOTS.every((slot) => leader.picks[slot].length === archetype.slots[slot].n)

  return (
    <>
      <HankSays>{selectGreeting({ archetype: leader.archetype })}</HankSays>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <Button onClick={() => loadKeywords(leader.keywords)} disabled={loading}>
          {loading ? 'Reading…' : models.length ? 'Refresh register' : 'Load eligible models'}
        </Button>
        <span className={`label${error ? ' note--warn' : ''}`} style={{ margin: 0 }}>{statusLine}</span>
      </div>

      {models.length === 0 && !loading && <HankSays>{selectOffline({})}</HankSays>}

      {models.length === 0 && !loading && (
        <div className="empty" style={{ marginBottom: 22 }}>
          Nothing loaded yet. Pull the two keywords to filter selections automatically, or record
          picks by hand below — the cost ceilings apply either way.
        </div>
      )}

      {SLOTS.map((slot) => (
        <SelectionSlot
          key={slot}
          slot={slot}
          archetype={archetype}
          leader={leader}
          roster={models}
          onChange={setPick}
        />
      ))}

      {archetype.keepsTrigger && leader.picks.attack.length > 0 && (
        <Field>
          <Label>Trigger — one, from the attack action you took</Label>
          {triggers.length > 0 ? (
            <div className="chips">
              {triggers.map((t) => (
                <Chip key={t} on={leader.trigger === t} onClick={() => set({ trigger: t })}>
                  {t}
                </Chip>
              ))}
            </div>
          ) : (
            <Input
              value={leader.trigger}
              onChange={(e) => set({ trigger: e.target.value })}
              placeholder="Trigger name from that action"
            />
          )}
          {leader.trigger && <HankSays tone="quiet">{selectTrigger({})}</HankSays>}
        </Field>
      )}

      {allFilled && <HankSays>{selectDone({})}</HankSays>}

      <Field>
        <HankSays>{CREATION.crewCard}</HankSays>
        <Label>Starting crew card — one effect</Label>
        <Select
          value={leader.crewCard.effect}
          onChange={(e) => set({ crewCard: { effect: e.target.value, choice: '' } })}
        >
          <option value="">Choose an effect…</option>
          {CREW_CARD_EFFECTS.map((e) => (
            <option key={e.id} value={e.id}>{e.name} (p.{e.page})</option>
          ))}
        </Select>

        {effect?.choice && (
          <div style={{ marginTop: 9 }}>
            <Input
              value={leader.crewCard.choice}
              onChange={(e) => set({ crewCard: { ...leader.crewCard, choice: e.target.value } })}
              placeholder={`Name the ${effect.choice}`}
            />
            {effect.barred && (
              <p className="note note--warn">
                {effect.barred.join(' and ')} may not be chosen.
              </p>
            )}
          </div>
        )}
      </Field>
    </>
  )
}
