import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true,
  },
}

// The app's frontend code calls the API via relative paths (`/api/...`),
// relying on same-origin — the dev/preview server's `proxy` above provides
// that locally. In production the frontend (Cloudflare Pages) and backend
// (Render) are on different domains, so Pages needs the same same-origin
// illusion: a `_redirects` file with a 200 status makes Pages transparently
// proxy `/api/*` through to the real backend, and every existing fetch call
// in the codebase keeps working completely unchanged. API_ORIGIN is a
// build-time env var set in the Cloudflare Pages dashboard — see
// docs/DEPLOYMENT.md. Writing it here (rather than a static public/_redirects
// file) means local dev never needs API_ORIGIN set at all.
const writeApiRedirects = (): Plugin => ({
  name: 'write-api-redirects',
  writeBundle(options) {
    const apiOrigin = process.env.API_ORIGIN
    if (!apiOrigin) return
    const outDir = options.dir || 'dist'
    writeFileSync(join(outDir, '_redirects'), `/api/*  ${apiOrigin.replace(/\/$/, '')}/api/:splat  200\n`)
  },
})

export default defineConfig({
  plugins: [tailwindcss(), react(), writeApiRedirects()],
  server: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: apiProxy,
  },
  // `vite preview` (serving the production dist/ build) doesn't inherit
  // `server` options — duplicated here so the /api proxy and tunnel host
  // still work when serving the real optimized build instead of the dev
  // server's unbundled-ESM-per-file mode (hundreds of individual module
  // requests, fine on localhost, very slow over a high-latency tunnel).
  preview: {
    allowedHosts: ['.trycloudflare.com'],
    proxy: apiProxy,
  },
})
