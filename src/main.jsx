import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

/**
 * The service worker is **not** registered here any more — see `index.html`.
 *
 * It used to be, and that was the flaw that made v0.19.3's cache-poisoning bug
 * unrecoverable rather than merely annoying. A poisoned cache stops this bundle
 * from loading at all, so a registration living inside it never runs, the
 * browser never checks for a new worker, and the fixed worker can never reach
 * the browsers that need it. The registration has to survive the bundle
 * failing, so it lives in an inline script in the document instead.
 *
 * Do not move it back.
 */
