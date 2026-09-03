import { Label, Field, Button } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import FlipInput, { RED_JOKER } from '../FlipInput.jsx'
import { barterGreeting, barterAcquired, barterEmpty } from '../../data/hank.js'
import { barterStock, thirstStock, reachesThirst } from '../../lib/aftermath.js'
import {
  heldEquipmentIds,
} from '../../lib/shape/arsenal.js'
import { ALWAYS } from '../../data/equipment.js'

/**
 * Phase 3 — one flip, then shopping.
 *
 * The flip is made once and the vendor's stock follows from it: only equipment
 * whose barter rating matches the value **and** the suit exactly, plus the four
 * always-available items that are on the counter whatever happens. Several
 * things may be bought off one flip, which is why buying does not end the
 * phase.
 *
 * The red joker is the interesting case and the reason `cheated` is asked for.
 * Flipped, it opens Those Who Thirst — the ancient-relic table, one at a time,
 * and only while you hold none. Cheated, it is worth thirteen and nothing more.
 * The app cannot tell those apart by looking at the card, so it asks.
 */
export default function PhaseBarter({ week, arsenal, record, handSize, onFlip, onBuy, onDone }) {
  const { value, suit, cheated, bought = [] } = record
  const held = heldEquipmentIds(arsenal)

  const thirstOpen = reachesThirst({ value, cheated })
  // A cheated red joker counts as a thirteen, so the ordinary counter is built
  // from that rather than from the joker itself.
  const effectiveValue = value === RED_JOKER && cheated ? 13 : value

  const stock = thirstOpen
    ? []
    : barterStock(effectiveValue, suit, { scrip: arsenal.scrip })
  const relics = thirstOpen
    ? thirstStock(record.thirstValue, { held }).map((e) => ({ ...e, affordable: e.cc <= arsenal.scrip }))
    : []

  const flipped = value != null
  const boughtSomething = bought.length > 0

  return (
    <>
      <HankSays>{barterGreeting({ week, handSize })}</HankSays>

      <FlipInput
        label="Your barter flip"
        value={value}
        suit={suit}
        cheated={cheated}
        onChange={(next) => onFlip({ ...next, thirstValue: null })}
        cheatedLabel="Cheated this from my aftermath hand"
      />

      {value === RED_JOKER && (
        <p className="gap-note">
          <strong>The red joker splits two ways.</strong> Flipped, you have found
          a vendor with something ancient and terrible — flip again on Those Who
          Thirst below. Cheated, it counts as a thirteen and the ordinary counter
          applies. Tick the box above if it came out of your hand.
        </p>
      )}

      {thirstOpen && (
        <Field>
          <Label>Those Who Thirst — flip again</Label>
          {held.length > 0 && relics.length === 0 && (
            <p className="note note--warn">
              You already hold one of these, so this result is ignored. Only one
              Those Who Thirst item at a time.
            </p>
          )}
          <FlipInput
            label=""
            value={record.thirstValue}
            onChange={(next) => onFlip({ value, suit, cheated, thirstValue: next.value })}
            needsSuit={false}
            needsCheated={false}
          />
          {record.thirstValue >= 9 && relics.length > 0 && (
            <p className="note">A 9 through 13 is a free choice from everything above it.</p>
          )}
        </Field>
      )}

      {flipped && (
        <Field>
          <Label>{thirstOpen ? 'On offer' : 'On the counter'}</Label>
          <ul className="stock">
            {(thirstOpen ? relics : stock).map((e) => {
              const owned = bought.includes(e.id)
              return (
                <li key={e.id} className="stock__row">
                  <span className="stock__name">{e.name}</span>
                  <span className="stock__meta">
                    {e.br === ALWAYS ? 'always available' : `BR ${e.br}`} · p.{e.page}
                  </span>
                  <span className="stock__cc">{e.cc} scrip</span>
                  <Button
                    ghost
                    disabled={owned || !e.affordable}
                    onClick={() => onBuy(e, thirstOpen)}
                  >
                    {owned ? 'Bought' : e.affordable ? 'Buy' : 'Too dear'}
                  </Button>
                </li>
              )
            })}
            {(thirstOpen ? relics : stock).length === 0 && (
              <li className="note">Nothing on offer for that flip.</li>
            )}
          </ul>
          <p className="note">
            Effects are printed in the book at the page shown — this app records
            what you own, not what it does.
          </p>
        </Field>
      )}

      {flipped && (
        <HankSays>
          {boughtSomething
            ? barterAcquired({ week, isRare: thirstOpen })
            : barterEmpty({ week })}
        </HankSays>
      )}

      <Button onClick={onDone} disabled={!flipped}>
        {boughtSomething ? 'Done shopping' : 'Buy nothing and move on'}
      </Button>
    </>
  )
}
