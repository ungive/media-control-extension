import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ['storage'],
  },
  imports: {
    addons: {
      vueTemplate: true,
    },
  },
  vite: () => ({
    plugins: [vue()],
    build: {
      // Enabling sourcemaps with Vue during development is known to cause problems with Vue
      sourcemap: false,
    },
  })
});
