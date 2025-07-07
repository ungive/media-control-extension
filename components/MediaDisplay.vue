<script lang="ts" setup>
import { isPopout } from '@/entrypoints/popup/popout';
import { CurrentMediaPayload, ExtensionMessage, PopoutStatePaylaod, PopupMessage, RuntimeMessage } from '@/lib/messages';
import { BrowserMedia } from '@/lib/proto';
import { ArrowUturnLeftIcon, ForwardIcon, PauseCircleIcon, PauseIcon, PlayCircleIcon, PlayIcon, ShareIcon, XMarkIcon } from '@heroicons/vue/16/solid';
import { Square2StackIcon } from '@heroicons/vue/20/solid';
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import ProgressBar from './ProgressBar.vue';
import TextWithLinks from './TextWithLinks.vue';

const items = ref<{
  tabId: number
  state: BrowserMedia.MediaState
  hasControls: boolean
}[]>([]);

const coverMinRem = 7
const computedItems = computed(() => items.value.map(item => ({
  ...item,
  src: selectImage(item.state.images, coverMinRem)
})))

const hasPopout = ref(false)
browser.runtime.sendMessage({
  type: PopupMessage.GetPopoutState
} as RuntimeMessage);

onMounted(() => {
  browser.runtime.onMessage.addListener(async (message: RuntimeMessage) => {
    switch (message.type) {
      case ExtensionMessage.CurrentMedia:
        const currentMediaPayload = message.payload as CurrentMediaPayload;
        items.value = currentMediaPayload.media.map(m => ({
          tabId: m.tabId,
          state: BrowserMedia.MediaState.fromJSON(m.stateJson),
          hasControls: m.hasControls
        })).sort((a, b) => b.tabId - a.tabId);
        break;
      case ExtensionMessage.PopoutOpened:
        hasPopout.value = true
        break;
      case ExtensionMessage.PopoutClosed:
        hasPopout.value = false
        break;
      case ExtensionMessage.PopoutState:
        const popoutStatePayload = message.payload as PopoutStatePaylaod
        hasPopout.value = popoutStatePayload.result
        break;
    }
  });

  // Connect to the background script for the time the popup is opened.
  browser.runtime.connect();

  // Request current media from the background script.
  browser.runtime.sendMessage({
    type: PopupMessage.GetCurrentMedia
  } as RuntimeMessage);
});

async function focusTabWindow(tabId: number) {
  const tab = await browser.tabs.get(tabId);
  if (tab.windowId !== undefined) {
    await browser.windows.update(tab.windowId, {
      focused: true
    });
  }
}

function showTab(tabId: number, closePopup: boolean = true) {
  focusTabWindow(tabId)
  browser.tabs.update(tabId, { active: true });
  if (closePopup && !isPopout()) {
    window.close();
  }
}

async function closeTab(tabId: number) {
  await browser.tabs.remove(tabId);
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

function getHomepage(url: string): string {
  return new URL(url).origin;
}

function getShareLink(
  resourceLinks: BrowserMedia.MediaState_ResourceLinks | undefined
): string | null {
  if (resourceLinks === undefined) {
    return null;
  }
  const trackUrls = Object.entries(resourceLinks.trackUrl)
  if (trackUrls.length > 0) {
    return trackUrls.at(0)![1];
  }
  const albumUrls = Object.entries(resourceLinks.albumUrl)
  if (albumUrls.length > 0) {
    return albumUrls.at(0)![1];
  }
  return null;
}

function pauseMedia(tabId: number) {
  browser.tabs.sendMessage(tabId, {
    type: PopupMessage.PauseMedia
  } as RuntimeMessage);
}

function playMedia(tabId: number) {
  browser.tabs.sendMessage(tabId, {
    type: PopupMessage.PlayMedia
  } as RuntimeMessage);
}

function nextTrack(tabId: number) {
  browser.tabs.sendMessage(tabId, {
    type: PopupMessage.NextTrack
  } as RuntimeMessage);
}

function seekStart(tabId: number) {
  browser.tabs.sendMessage(tabId, {
    type: PopupMessage.SeekStart
  } as RuntimeMessage);
}

function openPopout() {
  browser.runtime.sendMessage({
    type: PopupMessage.OpenPopout
  } as RuntimeMessage);
}
</script>

<template>
  <div id="root" class="w-full max-w-lg py-2 px-4">
    <div class="flex items-center justify-between my-2">
      <h4 class="flex-1 text-base font-bold leading-none text-gray-900 dark:text-gray-200">
        Media Control
      </h4>
      <div v-if="!isPopout()" class="flex-shrink-0">
        <a @click="openPopout" title="Popout window" target="_blank"
          class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 group-hover:opacity-100 transition-all duration-150">
          <Square2StackIcon class="size-4 mt-1"></Square2StackIcon>
        </a>
      </div>
    </div>
    <div class="flow-root min-w-120 max-w-120">
      <ul role="list" class="divide-y divide-gray-200 dark:divide-gray-700">
        <li class="py-3 group" v-for="item in computedItems" :key="item.tabId">
          <div class="flex items-stretch" v-if="item.state.metadata">
            <div class="flex-shrink-0 cursor-pointer" @click="showTab(item.tabId)">
              <img v-if="item.src" class="w-28 h-28 rounded-sm object-cover object-center"
                :title="item.state.metadata.album" :src="item.src" alt="Cover">
              <PlayCircleIcon v-else-if="item.state.playbackState?.playing"
                class="w-28 h-28 p-3 text-neutral-800 dark:text-neutral-200">
              </PlayCircleIcon>
              <PauseCircleIcon v-else class="w-28 h-28 p-3 text-neutral-800 dark:text-neutral-200"></PauseCircleIcon>
            </div>
            <div class="flex-1 flex flex-col min-h-full min-w-0 ms-4 text-sm -translate-y-0.5">
              <div class="flex-grow">
                <div class="flex cursor-default" v-if="item.state.source">
                  <div class="flex-1 truncate">
                    <a @click="showTab(item.tabId)" :title="item.state.metadata.title"
                      class="text-gray-900  dark:text-white border-b-1 border-transparent hover:border-gray-200 transition-colors duration-150 leading-6 no-underline">{{
                        item.state.metadata.title }}</a>
                  </div>
                  <div class="flex-shrink-0 ms-12">
                    <a @click="closeTab(item.tabId)" title="Close tab" target="_blank"
                      class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150">
                      <XMarkIcon class="size-4 mt-1"></XMarkIcon>
                    </a>
                  </div>
                </div>
                <div class="text-gray-500 dark:text-gray-400 truncate -mt-1" v-if="item.state.metadata?.artist">
                  <TextWithLinks base-class="leading-6"
                    link-class="no-underline border-b-1 border-gray-600 hover:border-gray-500 transition-colors duration-200"
                    :text="item.state.metadata?.artist" :links="item.state.resourceLinks?.artistUrl" />
                </div>
                <div class="text-gray-500 truncate dark:text-gray-400 -mt-1" v-if="item.state.metadata?.album">
                  <TextWithLinks base-class="leading-6"
                    link-class="no-underline border-b-1 border-gray-600 hover:border-gray-500 transition-colors duration-200"
                    :text="item.state.metadata?.album" :links="item.state.resourceLinks?.albumUrl" />
                </div>
              </div>
              <div class="text-gray-500 truncate dark:text-gray-400"
                v-if="item.state.playbackState && item.state.playbackState.positionTimestamp && item.state.metadata.duration">
                <ProgressBar :playing="item.state.playbackState.playing" :position="item.state.playbackState.position"
                  :position-timestamp="item.state.playbackState.positionTimestamp"
                  :duration="item.state.metadata.duration" class="mt-1"></ProgressBar>
              </div>
              <div class="flex items-center mt-1 cursor-default select-none" v-if="item.state.source">
                <div class="flex-shrink-0 flex"
                  :class="[item.hasControls ? '' : 'opacity-40 cursor-default pointer-events-none']">
                  <div class="flex-shrink-0 -ms-0.5">
                    <a @click="seekStart(item.tabId)" title="Replay this track"
                      class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200">
                      <ArrowUturnLeftIcon class="size-4 mt-1"></ArrowUturnLeftIcon>
                    </a>
                  </div>
                  <div class="flex-shrink-0 ms-2">
                    <a v-if="item.state.playbackState?.playing" @click="pauseMedia(item.tabId)" title="Pause"
                      class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200">
                      <PauseIcon class="size-4 mt-1"></PauseIcon>
                    </a>
                    <a v-else @click="playMedia(item.tabId)" title="Play"
                      class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200">
                      <PlayIcon class="size-4 mt-1"></PlayIcon>
                    </a>
                  </div>
                  <div class="flex-shrink-0 ms-2">
                    <a @click="nextTrack(item.tabId)" title="Next track"
                      class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200">
                      <ForwardIcon class="size-4 mt-1"></ForwardIcon>
                    </a>
                  </div>
                </div>
                <div class="flex-1 min-w-0 ms-2.5" v-if="item.state.source?.siteUrl">
                  <a class="no-underline text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors duration-200"
                    @click="showTab(item.tabId)">{{ getHostname(item.state.source.siteUrl) }}</a>
                </div>
                <template v-for="shareLink in [getShareLink(item.state.resourceLinks)]">
                  <div v-if="shareLink" class="flex-shrink-0">
                    <a :href="shareLink" target="_blank" title="Share"
                      class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200">
                      <ShareIcon class="size-4 mt-1"></ShareIcon>
                    </a>
                  </div>
                </template>
                <div class="flex-shrink-0 ms-2.5 me-0" v-if="item.state.source?.faviconUrl">
                  <a :href="getHomepage(item.state.source.siteUrl)"
                    :title="'Open ' + getHostname(item.state.source.siteUrl)" target="_blank">
                    <img class="w-4 h-4 mt-1 rounded-md object-cover object-center" :src="item.state.source?.faviconUrl"
                      alt="Favicon">
                  </a>
                </div>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
