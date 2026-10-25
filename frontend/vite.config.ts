import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The version shown in the UI comes from package.json
const packageJson = fileURLToPath(new URL('./package.json', import.meta.url));
const { version } = JSON.parse(readFileSync(packageJson, 'utf-8'));

// The define is only read on startup: restart the dev server when the version changes
function restartOnVersionChange(): Plugin {
  return {
    name: 'restart-on-version-change',
    configureServer(server) {
      server.watcher.add(packageJson);
      server.watcher.on('change', (file) => {
        if (file !== packageJson) return;
        const next = JSON.parse(readFileSync(packageJson, 'utf-8')).version;
        if (next !== version) server.restart();
      });
    },
  };
}

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3333';

export default defineConfig({
  plugins: [react(), tailwindcss(), restartOnVersionChange()],
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
