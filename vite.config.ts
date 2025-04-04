import { defineConfig } from 'vite';
import netlifyPlugin from '@netlify/vite-plugin-react-router';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [reactRouter(), tailwindcss(), netlifyPlugin()],
});
