import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Test-only entry point mounts production components without owner authentication,
// tracking, ads, or SEO generation. This is not part of the deployable app build.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'fixture'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '../../src') },
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
});