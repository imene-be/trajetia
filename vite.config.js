import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En développement, les appels /api sont envoyés au serveur (npm run server, port 3001)
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_URL || 'http://localhost:3001' } },
})
