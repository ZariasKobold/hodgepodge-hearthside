import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { save, load } from '../lib/storage.js'
import { HANK_TOGGLE_KEY } from '../data/hank.js'

/**
 * Whether the narrator is speaking.
 *
 * Context rather than props because Hank appears at a dozen render sites and
 * threading a boolean through every step component would be noise.
 *
 * He defaults ON. He's the reason this is a companion rather than a form with
 * cost validation, so hiding him behind an opt-in would waste him. The switch
 * exists for the player mid-game who wants the number, the screen reader user
 * who'd rather not hear 200 words before a form field, and anyone who simply
 * doesn't care for the voice.
 *
 * What the toggle must NOT hide: rules-gap explanations. Those are substance
 * wearing a costume and stay visible in both modes.
 */
const HankContext = createContext({ enabled: true, toggle: () => {} })

export function HankProvider({ children }) {
  const [enabled, setEnabled] = useState(() => load(HANK_TOGGLE_KEY, true))

  useEffect(() => {
    save(HANK_TOGGLE_KEY, enabled)
  }, [enabled])

  const toggle = useCallback(() => setEnabled((v) => !v), [])

  return <HankContext.Provider value={{ enabled, toggle }}>{children}</HankContext.Provider>
}

export function useHank() {
  return useContext(HankContext)
}
