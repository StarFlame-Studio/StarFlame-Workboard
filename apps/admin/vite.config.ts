import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const html = (name: string) => fileURLToPath(new URL('./' + name + '.html', import.meta.url))

export default defineConfig({
  base: '/',
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: {
        overview: html('index'),
        classes: html('classes'),
        class: html('class'),
        notices: html('notices'),
        users: html('users'),
        devices: html('devices'),
        audit: html('audit'),
        login: html('login'),
      },
    },
  },
  server: {
    port: 3032,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3002', changeOrigin: true },
    },
  },
})
