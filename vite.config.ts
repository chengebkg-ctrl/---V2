import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.svg', 'elsa.jpg'],
          manifestFilename: 'manifest.json',
          manifest: {
            name: "Elsa's English Teacher",
            short_name: "Elsa's English",
            description: "A minimalist vocabulary retention app using the Ebbinghaus forgetting curve algorithm.",
            theme_color: "#3B82F6",
            background_color: "#F8FAFC",
            display: "standalone",
            icons: [
              {
                src: 'icon.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              },
              {
                src: 'icon.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
