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
    },
  },
})
