/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// No secrets are injected into the client bundle. In BYOK mode the user's
// Gemini key is entered at runtime and never exists at build time.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
