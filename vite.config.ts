import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const normalizeBasePath = (path: string): string => {
  if (!path.startsWith('/')) {
    return `/${path}`
  }

  return path.endsWith('/') ? path : `${path}/`
}

const resolveBasePath = (env: Record<string, string>): string => {
  if (env.VITE_BASE_PATH) {
    return normalizeBasePath(env.VITE_BASE_PATH)
  }

  const repoName = env.GITHUB_REPOSITORY?.split('/')[1] ?? env.VITE_GH_PAGES_REPO

  return repoName ? `/${repoName}/` : '/'
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const basePath = resolveBasePath(env)

  return {
    base: basePath,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'pwa-192.svg', 'pwa-512.svg'],
        manifest: {
          name: 'Calendar App',
          short_name: 'Calendar',
          description: 'A PWA-ready calendar foundation wired for Supabase.',
          theme_color: '#0f766e',
          background_color: '#fcfbf7',
          display: 'standalone',
          scope: basePath,
          start_url: basePath,
          icons: [
            {
              src: 'pwa-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: 'pwa-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
          navigateFallback: 'index.html',
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
