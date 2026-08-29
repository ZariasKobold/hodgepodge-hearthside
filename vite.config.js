import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
