<script lang="ts" setup>
import { CurrentMediaElementPayload, CurrentMediaPayload, ExtensionMessage, PopupMessage, RuntimeMessage } from '@/lib/messages';
import { ref } from 'vue';

const items = ref<CurrentMediaElementPayload[]>([]);

browser.runtime.onMessage.addListener(async (message: RuntimeMessage, sender) => {
  switch (message.type) {
    case ExtensionMessage.CurrentMedia:
      const currentMediaPayload = message.payload as CurrentMediaPayload;
      items.value = currentMediaPayload.media;
      return;
  }
});

browser.runtime.sendMessage({
  type: PopupMessage.GetCurrentMedia
} as RuntimeMessage);

function showTab(tabId: number, closePopup: boolean = false) {
  browser.tabs.update(tabId, { active: true });
  if (closePopup) {
    window.close();
  }
}
</script>

<template>
  <ul>
    <li v-for="item in items">
      {{ item.state.metadata?.title }}
      by {{ item.state.metadata?.artist || '?' }}
      on {{ item.state.metadata?.album || '?' }},
      {{ item.state.playbackState?.position || '?' }}/{{ item.state.metadata?.duration || '?' }}
      <a v-on:click="showTab(item.tabId, true)">Open tab</a>
    </li>
  </ul>
</template>

<style scoped></style>
