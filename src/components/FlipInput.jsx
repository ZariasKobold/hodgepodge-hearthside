import { Label, Select } from './ui.jsx'
import { SUITS } from '../data/equipment.js'

/**
 * One card, entered by the player.
 *
 * The app does not own a fate deck and must not pretend to. Every flip in the
 * aftermath is made with the player's own deck on the table, cheated or not
 * from a hand the app cannot see — so this records what happened rather than
 * simulating it. A "flip for me" button would be a different game: the book's
 * whole aftermath economy is built on one hand of cards spent across six
 * phases, and a player who cheated a 12 here has one fewer card there.
 *
 * `cheated` is not decoration either. Three separate rules turn on it — a
 * cheated red joker on barter counts as a thirteen instead of reaching Those
 * Who Thirst, a cheated red joker on injuries is a plain miss rather than a
 * Lucky Miss, and a cheated joker on an advancement table reads as its value.
 * So it is asked for wherever it can change the answer, and only there.
 */

export const RED_JOKER = 'redJoker'
export const BLACK_JOKER = 'blackJoker'

const VALUES = [
  { value: BLACK_JOKER, label: 'Black Joker' },
  ...Array.from({ length: 13 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
  { value: RED_JOKER, label: 'Red Joker' },
]

export function isJoker(value) {
  return value === RED_JOKER || value === BLACK_JOKER
}

/** The select's string value back into a number or a joker key. */
function parse(raw) {
  if (raw === '') return null
  if (raw === RED_JOKER || raw === BLACK_JOKER) return raw
  return Number(raw)
}

export default function FlipInput({
  label = 'What did you flip?',
  value,
  suit,
  cheated = false,
  onChange,
  needsSuit = true,
  needsCheated = true,
  cheatedLabel = 'Cheated from my aftermath hand',
  disabled = false,
}) {
  const jokered = isJoker(value)

  return (
    <div className="flip">
      <Label>{label}</Label>
      <div className="flip__row">
        <Select
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange({ value: parse(e.target.value), suit, cheated })}
          disabled={disabled}
          aria-label="Card value"
        >
          <option value="">Card value…</option>
          {VALUES.map((v) => (
            <option key={String(v.value)} value={String(v.value)}>{v.label}</option>
          ))}
        </Select>

        {/* Jokers carry no suit, so asking for one would be asking for a fact
            that does not exist — the field goes away rather than sitting there
            greyed out and unanswerable. */}
        {needsSuit && !jokered && (
          <Select
            value={suit || ''}
            onChange={(e) => onChange({ value, suit: e.target.value || null, cheated })}
            disabled={disabled || value == null}
            aria-label="Card suit"
          >
            <option value="">Suit…</option>
            {Object.entries(SUITS).map(([k, name]) => (
              <option key={k} value={k}>{name}</option>
            ))}
          </Select>
        )}
      </div>

      {needsCheated && (
        <label className="hire__check">
          <input
            type="checkbox"
            checked={cheated}
            onChange={(e) => onChange({ value, suit, cheated: e.target.checked })}
            disabled={disabled || value == null}
          />
          {cheatedLabel}
        </label>
      )}
    </div>
  )
}
