import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // Set limit to 2000 kB
    chunkSizeWarningLimit: 3000,

    sourcemap: true
  },
  plugins: [react(), tailwindcss(), sentryVitePlugin({
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/types/**',
      ]
    },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});