import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5205,
    proxy: { '/api': 'http://localhost:3005' },
  },
  build: { chunkSizeWarningLimit: 900 },
});
