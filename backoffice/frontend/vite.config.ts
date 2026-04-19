import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 80,
    host: true,
    proxy: {
      '/.well-known/openid-configuration': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path: string) => path.replace('/.well-known/openid-configuration', '/auth/.well-known/openid-configuration'),
      },
      '/auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
