import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { seoPlugin } from './seo-plugin';

const port = Number(process.env.CLIENT_PORT || process.env.VITE_PORT || 3000);
const basePath = process.env.BASE_PATH || '/';
const apiTarget = process.env.API_TARGET || 'http://localhost:5000';

export default defineConfig({
  base: basePath,
  plugins: [
    seoPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@workspace/api-client-react': path.resolve(import.meta.dirname, 'src/api-client'),
      '@workspace/api-zod': path.resolve(import.meta.dirname, '../shared'),
      '@assets': path.resolve(import.meta.dirname, 'src/assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
  },
});
