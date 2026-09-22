import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        // Downloads (PDF/Excel via Content-Disposition: attachment) stream
        // their response instead of sending it in one shot. The shorthand
        // string form of the proxy config can be flaky with streamed /
        // chunked responses on Windows — the explicit object form below is
        // the more robust way to configure the same proxy.
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
