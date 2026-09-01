import { useState } from 'react'
import { Label, Field, Button, Input, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import { aftermathGreeting } from '../../data/hank.js'
import { liveModels, ratingForGame } from '../../lib/campaignShape.js'
import { maxEncounterSize } from '../../lib/campaign.js'

/**
 * What happened in the game, recorded before the aftermath can start.
 *
 * Deliberately the *only* place data entry happens in one lump. Hank is silent
 * through it (§3 — recording VP is someone finishing a chore) except for the
 * arrival line, which knows the week and nothing else and so cannot comment on
 * a game nobody has described yet (§2).
 *
 * Everything here is something the app cannot observe. The two experience
 * questions in particular look like trivia and are not: they decide whether
 * the leader gains one point this game or two, and a wrong answer compounds
 * for the rest of the campaign because the track only goes one way.
 */
export default function GameLog({ arsenal, leader, week, weeksRemaining, isFirst, onLog }) {
  const models = liveModels(arsenal)
  const [g, setG] = useState({
    opponent: '',
    strategy: '',
    encounterSize: '',
    schemesCompleted: 0,
    vpSelf: 0,
    vpOpponent: 0,
    result: '',
    withdrew: false,
    withdrewOnTurn: '',
    equipmentHiredCount: 0,
    campaignRatingOpponent: 0,
    killedModelIds: [],
    leaderWasKilled: false,
    killedNonPeon: false,
    interactedNearEnemyDeployment: false,
  })

  const set = (patch) => setG((prev) => ({ ...prev, ...patch }))

  // The rating for THIS game, which depends on how much kit was taken — so it
  // cannot be read off the arsenal and has to be computed from the answer.
  const ratingSelf = ratingForGame(arsenal, {
    equipmentHired: Array.from({ length: Number(g.equipmentHiredCount) || 0 }),
  })

  const path = leader.advancementPath
  const ownedEquipment = arsenal.equipment?.length || 0

  function submit() {
    onLog({
      opponent: g.opponent.trim(),
      strategy: g.strategy.trim(),
      encounterSize: g.encounterSize === '' ? null : Number(g.encounterSize),
      schemesCompleted: Number(g.schemesCompleted) || 0,
      vpSelf: Number(g.vpSelf) || 0,
      vpOpponent: Number(g.vpOpponent) || 0,
      result: g.result || null,
      withdrew: g.withdrew,
      withdrewOnTurn: g.withdrew && g.withdrewOnTurn !== '' ? Number(g.withdrewOnTurn) : null,
      campaignRatingSelf: ratingSelf,
      campaignRatingOpponent: Number(g.campaignRatingOpponent) || 0,
      // Stored as a list of ids so the count is never separately wrong; the
      // form asks for a number because which pieces went on which model is a
      // table-side detail the aftermath never reads.
      equipmentHired: Array.from(
        { length: Math.min(Number(g.equipmentHiredCount) || 0, ownedEquipment) },
        (_, i) => ({ equipmentId: arsenal.equipment[i]?.equipmentId ?? null, modelId: null })
      ),
      killedModelIds: g.killedModelIds,
      leaderWasKilled: g.leaderWasKilled,
      killedNonPeon: g.killedNonPeon,
      interactedNearEnemyDeployment: g.interactedNearEnemyDeployment,
    })
  }

  function toggleKilled(id) {
    set({
      killedModelIds: g.killedModelIds.includes(id)
        ? g.killedModelIds.filter((x) => x !== id)
        : [...g.killedModelIds, id],
    })
  }

  return (
    <>
      <HankSays>{aftermathGreeting({ week, isFirst, weeksRemaining })}</HankSays>

      <div className="hire__ledger">
        <span>week <strong>{week}</strong></span>
        <span><strong>{arsenal.scrip}</strong> scrip</span>
        <span>campaign rating <strong>{ratingSelf}</strong></span>
      </div>

      <Field>
        <Label>Opponent</Label>
        <Input
          value={g.opponent}
          onChange={(e) => set({ opponent: e.target.value })}
          placeholder="Whose crew you played"
        />
      </Field>

      <div className="grid2">
        <Field>
          <Label>Strategy</Label>
          <Input value={g.strategy} onChange={(e) => set({ strategy: e.target.value })} />
        </Field>
        <Field>
          <Label>Encounter size</Label>
          <Input
            value={g.encounterSize}
            onChange={(e) => set({ encounterSize: e.target.value })}
            inputMode="numeric"
            placeholder="soulstones"
          />
          <p className="note">
            Capped at the smaller arsenal plus six. Yours is worth{' '}
            {models.reduce((n, m) => n + (m.cost || 0), 0)}ss, so against an equal
            arsenal that is {maxEncounterSize(
              models.reduce((n, m) => n + (m.cost || 0), 0),
              models.reduce((n, m) => n + (m.cost || 0), 0)
            )}.
          </p>
        </Field>
      </div>

      <div className="grid3">
        <Field>
          <Label>Your VP</Label>
          <Input value={g.vpSelf} onChange={(e) => set({ vpSelf: e.target.value })} inputMode="numeric" />
        </Field>
        <Field>
          <Label>Their VP</Label>
          <Input value={g.vpOpponent} onChange={(e) => set({ vpOpponent: e.target.value })} inputMode="numeric" />
        </Field>
        <Field>
          <Label>Result</Label>
          <Select value={g.result} onChange={(e) => set({ result: e.target.value })}>
            <option value="">…</option>
            <option value="win">Won</option>
            <option value="loss">Lost</option>
            <option value="draw">Drew</option>
          </Select>
        </Field>
      </div>

      <div className="grid3">
        <Field>
          <Label>Schemes scored</Label>
          <Select value={g.schemesCompleted} onChange={(e) => set({ schemesCompleted: e.target.value })}>
            {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
          <p className="note">A scheme counts if it scored at least 1 VP. Three is the ceiling for the hand.</p>
        </Field>
        <Field>
          <Label>Equipment you hired</Label>
          <Select
            value={g.equipmentHiredCount}
            onChange={(e) => set({ equipmentHiredCount: e.target.value })}
            disabled={ownedEquipment === 0}
          >
            {Array.from({ length: ownedEquipment + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
          </Select>
          <p className="note">
            {ownedEquipment === 0
              ? 'None in the arsenal yet — barter is where they come from.'
              : 'Counted at hiring, not at owning, so it belongs to this game.'}
          </p>
        </Field>
        <Field>
          <Label>Their campaign rating</Label>
          <Input
            value={g.campaignRatingOpponent}
            onChange={(e) => set({ campaignRatingOpponent: e.target.value })}
            inputMode="numeric"
          />
          <p className="note">Arsenal sheets are public, so this is theirs to read out. Ratings can be negative.</p>
        </Field>
      </div>

      <Field>
        <label className="hire__check">
          <input type="checkbox" checked={g.withdrew} onChange={(e) => set({ withdrew: e.target.checked })} />
          We made a strategic withdrawal
        </label>
        {g.withdrew && (
          <>
            <Label>On which turn?</Label>
            <Select value={g.withdrewOnTurn} onChange={(e) => set({ withdrewOnTurn: e.target.value })}>
              <option value="">…</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Turn {n}</option>)}
            </Select>
            {/* This is the rules cliff, not a footnote. Uses .gap-note so it
                survives Hank being switched off (§5). */}
            <p className="gap-note">
              <strong>Turn one or two is different in kind.</strong> A crew that
              withdrew that early scores no VP, takes no barter flip and no
              aftermath hand, and <strong>loses the scrip it earned this game</strong>.
              It skips the whole aftermath except flipping for injuries. Turn
              three or later is an ordinary withdrawal and everything below still
              happens.
            </p>
          </>
        )}
      </Field>

      <Field>
        <Label>Models killed during the game</Label>
        <p className="note">
          One injury flip each in phase six — for models that <em>died</em>, not
          for everyone who fought. Peons never flip.
        </p>
        <div className="picklist">
          <label className="hire__check">
            <input
              type="checkbox"
              checked={g.leaderWasKilled}
              onChange={(e) => set({ leaderWasKilled: e.target.checked })}
            />
            {leader.name || 'Your leader'} <span className="hire__adj">(leader)</span>
          </label>
          {models.map((m) => (
            <label className="hire__check" key={m.id}>
              <input
                type="checkbox"
                checked={g.killedModelIds.includes(m.id)}
                onChange={() => toggleKilled(m.id)}
                disabled={m.peon}
              />
              {m.name}
              {m.peon && <span className="hire__adj"> (peon — never injured)</span>}
            </label>
          ))}
          {models.length === 0 && <p className="note">Nothing in the arsenal but the leader.</p>}
        </div>
      </Field>

      <Field>
        <Label>What your leader did</Label>
        <p className="note">
          Experience turns on these, and nothing here can see the table. Playing
          at all is worth a point on its own.
        </p>
        {path === 'bruiser' && (
          <label className="hire__check">
            <input
              type="checkbox"
              checked={g.killedNonPeon}
              onChange={(e) => set({ killedNonPeon: e.target.checked })}
            />
            Killed one or more non-peon enemy models <span className="hire__adj">(Bruiser)</span>
          </label>
        )}
        {path === 'strategist' && (
          <label className="hire__check">
            <input
              type="checkbox"
              checked={g.interactedNearEnemyDeployment}
              onChange={(e) => set({ interactedNearEnemyDeployment: e.target.checked })}
            />
            Interacted within 6" of the enemy deployment zone <span className="hire__adj">(Strategist)</span>
          </label>
        )}
        {!path && (
          <p className="note note--warn">
            This leader has no advancement path chosen, so only the point for
            playing (and the one for losing) can be earned. Set Bruiser or
            Strategist in Creation.
          </p>
        )}
      </Field>

      <Button onClick={submit} disabled={!g.result && !g.withdrew}>
        Record the game and begin the aftermath
      </Button>
    </>
  )
}
