<script lang="ts" setup>
import { TabMessage } from '@/lib/messages';
import { Proto } from '@/lib/proto';
import { ref } from 'vue';
interface MediaInfo {
  tabId: number | null
  title: string
  artist: string | undefined
  album: string | undefined
  position: number | undefined
  duration: number | undefined
  playing: boolean
}
const items = ref<MediaInfo[]>([
  {
    tabId: null,
    title: "Example",
    artist: "Artist",
    album: "Album",
    position: 0,
    duration: 100,
    playing: false,
  }
]);
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!sender.tab?.id) {
    // Can't handle messages without a valid tab.
    return;
  }
  switch (message.type) {
    case TabMessage.MediaChanged:
      const state = message.data as Proto.BrowserMedia.MediaState;
      items.value = [
        {
          tabId: sender.tab.id,
          title: state.metadata?.title || '?',
          artist: state.metadata?.artist,
          album: state.metadata?.album,
          position: state.playbackState?.position,
          duration: state.metadata?.duration,
          playing: state.playbackState?.playing || false
        }
      ];
      return;
  }
});
function showTab(tabId: number) {
  console.log('show', tabId)
  browser.tabs.update(tabId, {
    active: true
  })
}
</script>

<template>
  <ul>
    <li v-for="item in items">
      {{ item.title }} by {{ item.artist || '?' }} on {{ item.album || '?' }},
      {{ item.position || '?' }}/{{ item.duration || '?' }}
      <a v-on:click="showTab(item.tabId)">Open tab</a>
    </li>
  </ul>
</template>

<style scoped></style>
