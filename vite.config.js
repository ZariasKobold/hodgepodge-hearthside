import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

/**
 * What is actually live, baked in at build time.
 *
 * The version alone is not enough to answer "is my fix deployed?" — it only
 * moves when someone remembers to bump it, which is exactly the kind of thing
 * that gets forgotten (this file's own version sat at 0.8.0 while the project
 * had reached 0.17.0). The commit is the fact that cannot drift: Cloudflare
 * Pages sets `CF_PAGES_COMMIT_SHA` on every build, so the footer can name the
 * exact commit the running bundle came from.
 *
 * Falls back to 'dev' locally, which is the honest answer there.
 */
const BUILD = {
  version: pkg.version,
  commit: (process.env.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || 'dev',
  branch: process.env.CF_PAGES_BRANCH || 'local',
  builtAt: new Date().toISOString(),
}

/**
 * The dev proxy is the reason this app is a Vite project and not a single file.
 * A browser calling biggerhat.net directly from localhost gets blocked by CORS.
 * Routing through /api means the request leaves the dev server, not the browser,
 * so the same-origin rule never applies.
 *
 * This only exists in development. See README for the production options.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const upstream = env.VITE_REGISTRY_UPSTREAM || 'https://biggerhat.net'

  return {
    plugins: [react()],
    define: {
      __BUILD__: JSON.stringify(BUILD),
    },
    server: {
      proxy: {
        '/api': {
          target: upstream,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    test: {
      environment: 'node',
      // `functions/` is tested too. It runs on a different runtime and never
      // imports from `src/`, but the authorization logic there is the only code
      // in the project that can expose one player's data to another, so it is
      // the last place that should go untested.
      include: ['src/**/*.test.js', 'functions/**/*.test.js'],
    },
  }
})
