import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: [
    "@wxt-dev/module-vue",
  ],
  manifest: {
    name: "Media Control",
    permissions: ['tabs'],
    icons: {
      16: '/icon/icon-16.png',
      24: '/icon/icon-24.png',
      48: '/icon/icon-48.png',
      64: '/icon/icon-64.png',
      96: '/icon/icon-96.png',
      128: '/icon/icon-128.png',
      256: '/icon/icon-256.png',
    },
    web_accessible_resources: [
      {
        resources: ['inject.js'],
        matches: ['*://*/*']
      }
    ],
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: {
          required: ['none'],
          optional: []
        }
      }
    }
  }
});
