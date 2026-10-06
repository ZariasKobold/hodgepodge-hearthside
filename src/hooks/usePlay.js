import { useState, useCallback, useEffect } from 'react'
import { load, save, remove } from '../lib/storage.js'
import { createPlay } from '../lib/play.js'

/** Where one encounter's tracker lives. Exported so a logged game can clear it. */
export const playKey = (encounterId) => `play:${encounterId}`

/**
 * The table-side tracker for one encounter, kept on this device only.
 *
 * Not on the campaign document, deliberately: every campaign write is a push
 * to the account, and a game is dozens of health taps a turn. The tracker is
 * scratch paper for one evening. What the campaign keeps from it — the score
 * and who died — is written to the encounter once, when the game ends
 * (`playFacts`). A closed tab still loses nothing, because localStorage holds
 * it until the game is logged or the crew thrown away.
 */
export function usePlay(encounterId) {
  const [play, setPlay] = useState(() => (encounterId ? load(playKey(encounterId)) : null))

  // A different encounter is a different sheet of paper.
  useEffect(() => {
    setPlay(encounterId ? load(playKey(encounterId)) : null)
  }, [encounterId])

  /** Apply a pure change from `lib/play.js` and keep it. */
  const change = useCallback((fn) => {
    setPlay((prev) => {
      if (!prev || !encounterId) return prev
      const next = fn(prev)
      if (next !== prev) save(playKey(encounterId), next)
      return next
    })
  }, [encounterId])

  const start = useCallback((pool) => {
    if (!encounterId) return
    const fresh = createPlay({ pool, encounterId })
    save(playKey(encounterId), fresh)
    setPlay(fresh)
  }, [encounterId])

  const clear = useCallback(() => {
    if (encounterId) remove(playKey(encounterId))
    setPlay(null)
  }, [encounterId])

  return { play, change, start, clear }
}
