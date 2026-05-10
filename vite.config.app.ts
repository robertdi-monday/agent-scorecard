import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

export default defineConfig({
  root: 'src/app',
  plugins: [react()],
  define: {
    __SCORECARD_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      'node:module': resolve(__dirname, 'src/app/shims/node-module.ts'),
      'node:fs': resolve(__dirname, 'src/app/shims/node-fs.ts'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist-app'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/app/index.html'),
    },
  },
});
