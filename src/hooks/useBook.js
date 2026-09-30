import { useEffect, useState } from 'react'
import { ensureBookText } from '../lib/book.js'

/**
 * The book's text for a set of keys, if this player has earned them.
 *
 * Pass every key the component might display; one request covers the lot, and
 * keys already answered for this session are not asked about again. Resolves to
 * an empty map when the player is signed out, when nothing has been loaded into
 * D1, or when they have not earned the entry — all of which are ordinary and
 * none of which is an error. `BookText` then renders nothing and the screen
 * reads as it always has.
 *
 * The keys are joined into the dependency rather than passed as an array,
 * because a caller building the list inline creates a new array every render
 * and would otherwise refetch forever.
 */
export function useBookText(keys = []) {
  const [book, setBook] = useState(new Map())
  const fingerprint = keys.filter(Boolean).join('|')

  useEffect(() => {
    if (!fingerprint) return undefined
    let live = true
    ensureBookText(fingerprint.split('|')).then((map) => {
      // A new Map so React sees a changed reference — the module cache is
      // mutated in place and would otherwise never trigger a paint.
      if (live) setBook(new Map(map))
    })
    return () => { live = false }
  }, [fingerprint])

  return book
}
