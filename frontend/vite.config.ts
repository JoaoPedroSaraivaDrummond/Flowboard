import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// The version shown in the UI comes from package.json
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3333';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 5150),
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
