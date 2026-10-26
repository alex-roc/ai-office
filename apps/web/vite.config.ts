import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** En desarrollo la interfaz vive en Vite y los datos en el daemon; el proxy los une. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 7378,
    // `ws: true` es imprescindible: sin él el proxy no reenvía el upgrade del WebSocket
    // y la interfaz se queda sin eventos en vivo, en silencio.
    proxy: { '/api': { target: 'http://127.0.0.1:7377', changeOrigin: false, ws: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
