import { useHank } from '../hooks/useHank.jsx'

/**
 * One line of narration. Renders nothing when Hank is switched off, so call
 * sites stay a single component rather than a conditional each time.
 *
 * `aria-hidden` is deliberate: the dialogue is flavour, and a screen reader
 * user working through a form should reach the fields without wading through
 * it. Anyone who wants it read aloud can leave the toggle on and use the
 * transcript; anyone who doesn't gets a clean form either way.
 */
export default function HankSays({ children, tone = 'normal' }) {
  const { enabled } = useHank()
  if (!enabled || !children) return null

  return (
    <p className={`hank hank--${tone}`} aria-hidden="true">
      {children}
    </p>
  )
}
