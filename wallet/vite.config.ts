import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The QR scanner needs getUserMedia, which browsers only grant on a secure
    // context. localhost counts as secure; a bare LAN IP does not. To test on a
    // real phone over the network, run `vite --host` behind HTTPS or use a tunnel.
    host: true,
  },
  build: {
    // Slightly stricter than the default so an accidental dependency blow-up is
    // visible rather than silently shipped to a phone on campus wifi.
    chunkSizeWarningLimit: 600,
  },
});
