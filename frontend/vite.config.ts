import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/corpus': {
        target: process.env.CORPUS_PROXY_TARGET || 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/corpus/, ''),
      },
      // The relay. Proxied rather than called on its own origin so a phone that
      // loaded the game over the LAN reaches the backend at the same host it
      // already trusts — no second address to type, and no CORS preflight on
      // every intent.
      '/api': {
        target: process.env.BACKEND_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        // The events endpoint is a long-lived stream; buffering it would hold
        // every event until the response ended, which it never does.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['x-no-compression'] = '1'
            }
          })
        },
      },
    },
  },
})
