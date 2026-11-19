import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'

const root = fileURLToPath(new URL('.', import.meta.url))
// DESKTOP_BUILD=1：产物给 Electron 桌面端（app:// 自定义协议加载，无需 Service Worker）
const forDesktop = process.env.DESKTOP_BUILD === '1'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    ...(forDesktop
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
            manifest: {
              name: '星焰作业板',
              short_name: '星焰作业板',
              description: '把今天交给大屏',
              lang: 'zh-CN',
              theme_color: '#16130F',
              background_color: '#F7F6F4',
              display: 'fullscreen',
              start_url: './index.html',
              // 部分平台（Chrome 商店列表、桌面安装器信息）会读取开发者/发布者信息
              ...({ developer: { name: '焰火工作室' }, publisher: '焰火工作室' } as Record<string, unknown>),
              icons: [
                { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              // 字体等资源带 ?v=xxx 版本查询串，必须忽略查询参数才能命中预缓存
              globPatterns: ['**/*.{js,css,html,svg,woff2,png,ico,webmanifest}'],
              ignoreURLParametersMatching: [/.*/],
              navigateFallback: 'index.html',
              // /desktop/ 是独立的静态下载页，不能被 SPA 的 navigateFallback 抢走（否则老用户带 SW 打开会白屏）
              navigateFallbackDenylist: [/^\/desktop\//, /^\/desktop$/],
              cleanupOutdatedCaches: true,
              // 新版本立即接管，避免旧 Service Worker 继续提供老页面（旧构建里仍显示 1.2.0）
              skipWaiting: true,
              clientsClaim: true,
            },
          }),
        ]),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // 桌面端构建输出到 apps/desktop/renderer，随安装包内置（断网也能开）
    outDir: forDesktop ? resolve(root, '../desktop/renderer') : 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        welcome: resolve(root, 'welcome.html'),
        bind: resolve(root, 'bind.html'),
        settings: resolve(root, 'settings.html'),
        list: resolve(root, 'list.html'),
        exams: resolve(root, 'exams.html'),
        templates: resolve(root, 'templates.html'),
      },
    },
  },
  server: {
    port: 3031,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3002', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3002', ws: true },
    },
  },
})
