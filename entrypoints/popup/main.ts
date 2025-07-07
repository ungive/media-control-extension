import { createApp } from 'vue';
import App from './App.vue';
import { initPopout, isPopout } from './popout';
import './style.css';

createApp(App).mount('#app');

if (isPopout()) {
  initPopout()
}
