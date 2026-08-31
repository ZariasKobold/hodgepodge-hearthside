import { useHank } from '../hooks/useHank.jsx'

/**
 * One line of narration. Renders nothing when Hank is switched off, so call
 * sites stay a single component rather than a conditional each time.
 *
 * `aria-hidden` is deliberate: the dialogue is flavour, and a screen reader
 * user working through a form should reach the fields without wading through
 * it. Anyone who wants it read aloud can leave the toggle on and use the
 * transcript; anyone who doesn't gets a clean form either way.
 *
 * The portrait rides inside that same `aria-hidden` wrapper, so giving him a
 * face costs a screen reader user nothing. It is a plain `<img>` pointed at a
 * file in `public/art/` rather than an inline SVG, so the artwork can be
 * replaced by overwriting one file — no component change, no rebuild of this
 * module. `alt=""` because the surrounding block is already hidden and the
 * picture carries no information the line does not.
 */
export default function HankSays({ children, tone = 'normal' }) {
  const { enabled } = useHank()
  if (!enabled || !children) return null

  return (
    <div className={`hank hank--${tone}`} aria-hidden="true">
      <img className="hank__portrait" src="/art/hank-portrait.svg" alt="" width="66" height="66" />
      <p className="hank__line">{children}</p>
    </div>
  )
}
