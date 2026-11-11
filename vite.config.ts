import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import orderHandler from './api/order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  if (!process.env.GOOGLE_SHEETS_WEBAPP_URL && env.GOOGLE_SHEETS_WEBAPP_URL) {
    process.env.GOOGLE_SHEETS_WEBAPP_URL = env.GOOGLE_SHEETS_WEBAPP_URL;
  }

  return {
    publicDir: path.resolve(__dirname, 'public'),
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'local-order-api',
        configureServer(server) {
          server.middlewares.use('/api/order', (req, res) => {
            void orderHandler(req, res);
          });
        },
      },
      {
        name: 'copy-images-folder',
        closeBundle() {
          const srcDir = path.resolve(__dirname, 'images');
          const destDir = path.resolve(__dirname, 'dist/images');
          if (fs.existsSync(srcDir)) {
            fs.cpSync(srcDir, destDir, { recursive: true });
          }
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          simulator: path.resolve(__dirname, 'simulator.html'),
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
