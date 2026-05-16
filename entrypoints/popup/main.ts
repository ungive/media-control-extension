import { createApp } from 'vue';
import App from './App.vue';
import { initPopout, isPopout } from './popout';
import './style.css';

createApp(App).mount('#app');

if (isPopout()) {
  initPopout();
}

// Prevent showing the context menu for anything but link elements.
document.body.addEventListener('contextmenu', (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('a') === null) {
    e.preventDefault();
  }
});
