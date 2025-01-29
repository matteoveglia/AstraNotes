import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // Set limit to 2000 kB
    chunkSizeWarningLimit: 2000,

    sourcemap: true
  },
  plugins: [react(), sentryVitePlugin({
    org: "astra-lumen-images-inc",
    project: "astranotes-react",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    sourcemaps: {
      assets: "./dist/**",
    },
  })],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});