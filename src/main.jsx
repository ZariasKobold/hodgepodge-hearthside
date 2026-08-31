import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

/**
 * Register the service worker, which is what makes this installable.
 *
 * **Production only.** `npm run dev` serves `public/` too, so registering there
 * would put a worker in front of the dev server and start caching whatever Vite
 * happened to be serving at the time — which is the classic way to spend an
 * afternoon debugging a stale bundle that no longer exists on disk.
 *
 * Failure is silent on purpose: the app works perfectly well without a worker,
 * and a browser that refuses one (private windows in some browsers, an
 * unsupported version) should not see an error about a feature it did not ask
 * for.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
