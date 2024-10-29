<script lang="ts" setup>
import { CurrentMediaElementPayload, CurrentMediaPayload, ExtensionMessage, PopupMessage, RuntimeMessage } from '@/lib/messages';
import { BrowserMedia } from '@/lib/proto';
import { ref } from 'vue';
import ProgressBar from './ProgressBar.vue';

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

function convertRemToPixels(rem: number) {
  return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
}

function selectImage(images: BrowserMedia.MediaState_Image[], minRem: number): string | undefined {
  const minPixels = convertRemToPixels(minRem);
  let selectedImage: {
    url: string
    size: number
  } | null = null;
  for (const image of images) {
    if (image.width === undefined || image.height === undefined || image.url === undefined)
      continue;
    const size = Math.min(image.width, image.height);
    if (selectedImage === null
      || (size < minPixels && size > selectedImage.size)
      || (size >= minPixels && (selectedImage.size < minPixels || size < selectedImage.size))) {
      selectedImage = {
        url: image.url,
        size: size
      };
    }
  }
  return selectedImage?.url;
}

function getHostname(url: string): string {
  const hostname = new URL(url).hostname;
  return hostname.replace(/^(www\.)/, "");
}
</script>

<template>
  <div class="w-full max-w-lg py-2 px-4">
    <div class="flex items-center justify-between my-2">
      <h4 class="text-md font-bold leading-none text-gray-900 dark:text-gray-200">
        Media Control
      </h4>
    </div>
    <div class="flow-root">
      <ul role="list" class="divide-y divide-gray-200 dark:divide-gray-700">
        <li class="py-3 sm:py-4" v-for="item in items">
          <div class="flex items-center" v-if="item.state.metadata">
            <div class="flex-shrink-0">
              <img class="w-28 h-28 rounded-md cursor-pointer object-cover object-center"
                :title="item.state.metadata.album" :src="selectImage(item.state.images, 7)" alt="Cover"
                @click="showTab(item.tabId)">
            </div>
            <div class="flex-1 min-w-0 ms-4 text-sm">
              <div class="font-medium text-gray-900 truncate dark:text-white" :title="item.state.metadata.title">
                <a v-if="item.state.resourceLinks?.trackUrl" :href="item.state.resourceLinks?.trackUrl" target="_blank"
                  class="decoration-gray-600 underline-offset-2">{{
                    item.state.metadata.title }}</a>
                <span v-else>{{ item.state.metadata.title }}</span>
              </div>
              <div class="text-gray-500 truncate dark:text-gray-400" v-if="item.state.metadata?.artist">
                by
                <a v-if="item.state.resourceLinks?.artistUrl" :href="item.state.resourceLinks?.artistUrl"
                  target="_blank" class="decoration-gray-600 underline-offset-2">{{
                    item.state.metadata.artist }}</a>
                <span v-else>{{ item.state.metadata.artist }}</span>
              </div>
              <div class="text-gray-500 truncate dark:text-gray-400" v-if="item.state.metadata?.album">
                on
                <a v-if="item.state.resourceLinks?.albumUrl" :href="item.state.resourceLinks?.albumUrl" target="_blank"
                  class="decoration-gray-600 underline-offset-2">{{ item.state.metadata.album }}</a>
                <span v-else>{{ item.state.metadata.album }}</span>
              </div>
              <div class="text-gray-500 truncate dark:text-gray-400"
                v-if="item.state.playbackState && item.state.playbackState.positionTimestamp && item.state.metadata.duration">
                <ProgressBar :playing="item.state.playbackState.playing" :position="item.state.playbackState.position"
                  :position-timestamp="item.state.playbackState.positionTimestamp"
                  :duration="item.state.metadata.duration" class="mt-1"></ProgressBar>
              </div>
              <div class="flex items-center mt-1 cursor-default select-none" v-if="item.state.metadata">
                <div class="flex-shrink-0" v-if="item.state.source?.faviconUrl">
                  <img class="w-4 h-4 mt-1 rounded-md object-cover object-center grayscale"
                    :src="item.state.source?.faviconUrl" alt="Favicon">
                </div>
                <div class="flex-1 min-w-0 ms-2 text-gray-500" v-if="item.state.source?.siteUrl">
                  <a class="no-underline hover:underline hover:underline-offset-2" @click="showTab(item.tabId)">{{
                    getHostname(item.state.source.siteUrl) }}</a>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
