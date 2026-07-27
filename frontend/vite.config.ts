import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [react()],
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
