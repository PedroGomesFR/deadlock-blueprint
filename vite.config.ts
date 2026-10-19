/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy of the built pages: local files only, plus the fonts, the game data and the icons of
// items newer than the release (src/data/dataSource.ts). Not in development: Vite's hot reload needs inline scripts.
const CSP = [
  "default-src 'self' file:",
  "script-src 'self' file: 'wasm-unsafe-eval'",
  "worker-src 'self' file: blob:",
  "style-src 'self' file: 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' file: https://fonts.gstatic.com",
  "img-src 'self' file: data: blob: https://raw.githubusercontent.com https://assets-bucket.deadlock-api.com",
  "connect-src 'self' file: https://raw.githubusercontent.com",
  "media-src 'self' blob: mediastream:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ')

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // replay.html: the scanner alone, for scripts/vision-replay.cjs (regression tests, recalibration)
      input: { main: 'index.html', replay: 'replay.html' },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
