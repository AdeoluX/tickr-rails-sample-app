import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the app runs on 5173 and sends /api calls to the Coopsaas backend on 4100
export default defineConfig({
    plugins: [react()],
    server: { port: 5173, proxy: { '/api': 'http://localhost:4100' } }
});
