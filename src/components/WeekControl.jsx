import { useState } from 'react'
import { Button, Input, Label, Select } from './ui.jsx'
import {
  elapsedWeek, weekAdjustment, weekMode, canRegress, MIN_WEEKS_TOTAL, MAX_WEEKS_TOTAL,
} from '../lib/shape/campaign.js'
/**
 * The week, the means to disagree with it, and the settings underneath it.
 *
 * The week is not decoration. It decides which hires get the 5-scrip
 * first-of-week discount, whether a hire is owed at all, which week each model
 * and injury is filed under, and what every game is stamped with. Being wrong
 * about it is being wrong about the ledger, which is why this sits at the top
 * of the campaign view rather than behind a settings pane.
 *
 * ## Two modes, and why both exist
 *
 * **Calendar** derives the week from real time and a correction offset. It can
 * never go stale and two devices that never speak still agree.
 *
 * **Manual** stores the number and moves only when someone moves it. Migration
 * 0001 argued against exactly this — "a counter is only right if someone
 * remembers to press a button" — and that is true for a group who would rather
 * not think about it, and irrelevant to a group who has decided to drive it. A
 * campaign that meets when it can is *wrong* in calendar mode.
 *
 * Forward and back are offered in both. Regressing was the gap: the offset
 * could only ever be written by typing an absolute number, so a group who
 * ticked over by mistake, or agreed to replay a week nobody could make, had no
 * way back that looked like a way back.
 */

/** `<input type="date">` wants YYYY-MM-DD in local time, not an ISO instant. */
function toDateInput(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Noon local, so a timezone shift cannot roll the date onto the day before. */
function fromDateInput(value) {
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

export default function WeekControl({
  campaign, week, weeksTotal,
  onSetWeek, onStepWeek, onSetWeekMode, onResetWeek,
  onSetStartedAt, onSetWeeksTotal, onSetWeekLength,
}) {
  const [editing, setEditing] = useState(false)
  const [settings, setSettings] = useState(false)
  const [draft, setDraft] = useState(String(week))

  const mode = weekMode(campaign)
  const calendar = elapsedWeek(campaign)
  const adjusted = weekAdjustment(campaign) !== 0
  const over = week > weeksTotal
  const back = canRegress(campaign)

  function commit() {
    const n = Number(draft)
    if (Number.isFinite(n) && n >= 1) onSetWeek(n)
    setEditing(false)
  }

  return (
    <div className="weekbar">
      <div className="weekbar__now">
        <span className="weekbar__k">Week</span>
        <span className="weekbar__v">{week}</span>
        <span className="weekbar__of">of {weeksTotal}</span>
      </div>

      <div className="weekbar__aside">
        {/* Both directions, always. A step is the common case; typing a number
            is the correction, and settings are the rare one. */}
        <div className="weekbar__step">
          <Button
            ghost
            onClick={() => onStepWeek(-1)}
            disabled={!back}
            title={back ? 'Back a week' : 'Already at week one'}
            aria-label="Back a week"
          >
            ‹ Back
          </Button>
          <Button ghost onClick={() => onStepWeek(1)} aria-label="Forward a week">
            Next ›
          </Button>
        </div>

        {!editing && (
          <Button ghost onClick={() => { setDraft(String(week)); setEditing(true) }}>
            Set week
          </Button>
        )}

        {editing && (
          <div className="weekbar__edit">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
              inputMode="numeric"
              aria-label="Week number"
              autoFocus
            />
            <Button onClick={commit}>Set</Button>
            <Button ghost onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        )}

        <Button ghost onClick={() => setSettings((v) => !v)} aria-expanded={settings}>
          {settings ? 'Hide setup' : 'Campaign setup'}
        </Button>
      </div>

      {mode === 'calendar' && adjusted && (
        <p className="weekbar__note">
          Set by hand — the calendar alone says week {calendar}. It still
          advances from here.{' '}
          <button className="gate__link" onClick={onResetWeek}>
            Back to the calendar
          </button>
        </p>
      )}

      {mode === 'manual' && (
        <p className="weekbar__note">
          Manual — this week will not change until someone changes it.
        </p>
      )}

      {over && (
        <p className="note note--warn weekbar__over">
          This is past week {weeksTotal}, where the campaign was set to end.
          Nothing stops you carrying on — the number is your group's agreement,
          not a lock.
        </p>
      )}

      {settings && (
        <div className="weekbar__setup">
          <div className="grid3">
            <div className="field">
              <Label>How the week advances</Label>
              <Select value={mode} onChange={(e) => onSetWeekMode(e.target.value)}>
                <option value="calendar">By the calendar</option>
                <option value="manual">Only when I say</option>
              </Select>
              <p className="note">
                {mode === 'calendar'
                  ? 'Follows real time from the start date, so it is right even if nobody opens the app.'
                  : 'Stays put until you move it. Right for a group that plays when it can.'}
              </p>
            </div>

            <div className="field">
              <Label>Campaign length</Label>
              <Input
                value={weeksTotal}
                onChange={(e) => onSetWeeksTotal(e.target.value)}
                inputMode="numeric"
                aria-label="Weeks in the campaign"
              />
              <p className="note">
                The book recommends 4 to 12, agreed before anyone starts.
                Anything from {MIN_WEEKS_TOTAL} to {MAX_WEEKS_TOTAL} is allowed here.
              </p>
            </div>

            <div className="field">
              <Label>A week is</Label>
              <Select
                value={campaign.houseRules?.weekLengthDays ?? 7}
                onChange={(e) => onSetWeekLength(Number(e.target.value))}
                disabled={mode === 'manual'}
              >
                {[1, 2, 3, 4, 5, 7, 14].map((d) => (
                  <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>
                ))}
              </Select>
              <p className="note">
                {mode === 'manual'
                  ? 'Not used in manual mode — nothing is measured from the clock.'
                  : 'The book invites any increment: "If you want a new week to start every three days, or even every day, don’t hesitate."'}
              </p>
            </div>
          </div>

          {mode === 'calendar' && (
            <div className="field">
              <Label>The campaign began</Label>
              <Input
                type="date"
                value={toDateInput(campaign.startedAt)}
                onChange={(e) => {
                  const ts = fromDateInput(e.target.value)
                  if (ts) onSetStartedAt(ts)
                }}
                aria-label="Campaign start date"
              />
              <p className="note">
                Editable because the app is usually opened <em>after</em> the
                first game. Every week in calendar mode is measured from here,
                so setting it right is often tidier than carrying an offset.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
