<script lang="ts" setup>
import { isPopout } from '@/entrypoints/popup/popout';
import { CurrentMediaPayload, ExtensionMessage, MediaControlCapabilities, OpenLinkPayload, PopoutStatePaylaod, PopupMessage, RuntimeMessage, SeekPositionPayload } from '@/lib/messages';
import { BrowserMedia } from '@/lib/proto';
import { ArrowUturnLeftIcon, ForwardIcon, GlobeAltIcon, PauseCircleIcon, PauseIcon, PlayCircleIcon, PlayIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/vue/16/solid';
import { InformationCircleIcon } from '@heroicons/vue/20/solid';
import { Square2StackIcon } from '@heroicons/vue/20/solid';
import { Icon } from '@iconify/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import OverflowingText from './OverflowingText.vue';
import ProgressBar from './ProgressBar.vue';
import TextWithLinks, { LinkClickEvent } from './TextWithLinks.vue';
import DevBanner from './DevBanner.vue';
import { devBannerHidden } from '@/lib/util/storage';
import { ArrowsPointingOutIcon as ArrowsPointingOutIcon20 } from '@heroicons/vue/20/solid';
import { ArrowsPointingOutIcon as ArrowsPointingOutIcon16 } from '@heroicons/vue/16/solid';

const COVER_MIN_REM = 7

const hasPopout = ref(false)

const items = ref<{
  tabId: number
  state: BrowserMedia.MediaState
  // FIXME Group this under "clientState" or a similar field.
  controls: MediaControlCapabilities
  metadataButtons: Set<string>
  isCoverBright: boolean
}[]>([]);

if (process.env.NODE_ENV === 'development') {
  watch(items, value => {
    for (const item of value) {
      if (item.state.metadata === undefined) {
        console.warn("Missing metadata", item)
      }
    }
  })
}

const tabMuteStates = ref<Record<number, boolean>>({});

watch(items, async (newItems) => {
  await Promise.all(newItems.map(item => loadMutedState(item.tabId)));

  // Clean up removed tabs.
  const validTabIds = new Set(newItems.map(i => i.tabId));
  for (const tabId of Object.keys(tabMuteStates.value)) {
    if (!validTabIds.has(Number(tabId))) {
      delete tabMuteStates.value[Number(tabId)];
    }
  }
}, {
  immediate: true,
  deep: true,
});

async function loadMutedState(tabId: number) {
  try {
    const tab = await browser.tabs.get(tabId);
    tabMuteStates.value[tabId] = !!tab.mutedInfo?.muted;
  } catch (e) {
    console.error(e);
    tabMuteStates.value[tabId] = false;
  }
}

function handleTabUpdated(tabId: number, info: Browser.tabs.OnUpdatedInfo) {
  if (info.mutedInfo) {
    tabMuteStates.value[tabId] = info.mutedInfo.muted;
  }
}

async function isBrightCorner(url: string): Promise<boolean> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;

    await img.decode();

    const size = 32;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      img,
      img.width - size,
      img.height - size,
      size,
      size,
      0,
      0,
      size,
      size,
    );

    const data = ctx.getImageData(0, 0, size, size).data;

    let total = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = data.slice(i, i + 4);

      if (a < 25) continue;

      total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      count++;
    }

    return total / count > 200;
  } catch {
    return false;
  }
}

onMounted(async () => {
  // React to messages from the background script.
  browser.runtime.onMessage.addListener(async (message: RuntimeMessage) => {
    switch (message.type) {
      case ExtensionMessage.CurrentMedia:
        const currentMediaPayload = message.payload as CurrentMediaPayload;
        items.value = (await Promise.all(currentMediaPayload.media.map(async m => {
          const parsedState = BrowserMedia.MediaState.fromJSON(m.stateJson);
          const smallestImage = parsedState.images.length > 0 ? selectImage(parsedState.images, 1) : undefined;
          return {
            tabId: m.tabId,
            state: parsedState,
            controls: m.controls,
            metadataButtons: m.metadataButtons,
            // FIXME This can take a long time to load and might block indefinitely!
            isCoverBright: smallestImage ? await isBrightCorner(smallestImage) : false,
          };
        }))).sort((a, b) => {
          if (a.state.playbackState?.positionTimestamp && !b.state.playbackState?.positionTimestamp) {
            return -1
          }
          if (b.state.playbackState?.positionTimestamp && !a.state.playbackState?.positionTimestamp) {
            return 1
          }
          if (a.state.playbackState?.positionTimestamp && b.state.playbackState?.positionTimestamp) {
            return b.state.playbackState.positionTimestamp.getTime() - a.state.playbackState.positionTimestamp.getTime()
          }
          return b.tabId - a.tabId
        });
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
  browser.runtime.connect({ name: "popup" });

  // Request the popout state.
  browser.runtime.sendMessage({
    type: PopupMessage.GetPopoutState
  } as RuntimeMessage);

  // Request current media from the background script.
  browser.runtime.sendMessage({
    type: PopupMessage.GetCurrentMedia
  } as RuntimeMessage);

  // Handle tab updates and tab mute changes.
  browser.tabs.onUpdated.addListener(handleTabUpdated);
});

onUnmounted(() => {
  // Make sure to unregister the tab update listener.
  browser.tabs.onUpdated.removeListener(handleTabUpdated);
});

const computedItems = computed(() => items.value.map(item => ({
  ...item,
  src: selectImage(item.state.images, COVER_MIN_REM),
  muted: tabMuteStates.value[item.tabId] ?? false,
})))

async function showTab(tabId: number, closePopup: boolean = true) {
  const tab = await browser.tabs.get(tabId);
  await browser.tabs.update(tabId, {
    active: true
  });
  if (tab.windowId) {
    await browser.windows.update(tab.windowId, {
      focused: true
    });
  }
  if (closePopup && !isPopout()) {
    window.close();
  }
}

async function openOrFocusTab(href: string, closePopup: boolean = true) {
  const tabs = await browser.tabs.query({});
  const existingTab = tabs.find((tab) => {
    return tab.url && tab.url === href;
  });
  if (existingTab?.id) {
    await browser.tabs.update(existingTab.id, {
      active: true,
    });
    if (existingTab.windowId) {
      await browser.windows.update(existingTab.windowId, {
        focused: true,
      });
    }
  } else {
    await browser.tabs.create({
      url: href,
    });
  }
  if (closePopup && !isPopout()) {
    window.close();
  }
}

function toggleTabMute(tabId: number) {
  const state = tabMuteStates.value[tabId];
  if (state !== undefined) {
    browser.tabs.update(tabId, { muted: !state });
  } else {
    console.assert(false, "Missing muted state");
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
    if (image.url === undefined) {
      continue
    }
    let size = 0
    if (image.width === undefined && image.height === undefined) {
      continue;
    } else if (image.height === undefined) {
      size = image.width! // Assume it's a square
    } else if (image.width === undefined) {
      size = image.height! // Assume it's a square
    } else {
      size = Math.min(image.width, image.height)
    }
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
): string | undefined {
  if (resourceLinks === undefined) {
    return undefined;
  }
  const trackUrls = Object.entries(resourceLinks.trackUrl);
  if (trackUrls.length > 0) {
    return trackUrls.at(0)![1];
  }
  const albumUrls = Object.entries(resourceLinks.albumUrl);
  if (albumUrls.length > 0) {
    return albumUrls.at(0)![1];
  }
  return undefined;
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

function seekPosition(tabId: number, position: number) {
  browser.tabs.sendMessage(tabId, {
    type: PopupMessage.SeekPosition,
    payload: {
      position
    } as SeekPositionPayload
  } as RuntimeMessage);
}

function openPopout() {
  browser.runtime.sendMessage({
    type: PopupMessage.OpenPopout
  } as RuntimeMessage);
}

async function openLink(tabId: number, text: string, href: string | undefined) {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: PopupMessage.OpenLink,
      payload: {
        text,
        href,
      } as OpenLinkPayload
    } as RuntimeMessage);
    // On success, focus the tab.
    showTab(tabId);
  } catch (e) {
    console.error(e);
    // Fall back to opening the link in a new tab.
    if (href !== undefined) {
      window.open(href, '_blank')?.focus();
    }
  }
}

const devBannerHiddenState = ref(false)

onMounted(async () => {
  devBannerHiddenState.value = await devBannerHidden.getValue()
})

async function showDevBanner() {
  devBannerHiddenState.value = false
  await devBannerHidden.setValue(false)
}

devBannerHidden.watch((value) => {
  devBannerHiddenState.value = value;
});

const failedFavicons = ref(new Set<string>());

function handleFaviconError(url?: string) {
  if (url) {
    failedFavicons.value.add(url);
  }
}

function hasFailedFavicon(url?: string) {
  return !url || failedFavicons.value.has(url);
}

function openImageViewer(images: BrowserMedia.MediaState_Image[]) {
  // TODO Open an actual image viewer. Some ideas:
  // - Focus the tab and overlay an image viewer into the tab
  // - Open a separate window (like the pop-out and show an image viewer)
  // - Fill the pop-up window with the image at full size
  const imageHref = selectImage(images, 999999);
  if (imageHref !== undefined) {
    openOrFocusTab(imageHref);
  }
}
</script>

<template>
  <div id="root" class="w-full max-w-lg py-2 px-4">
    <div v-if="!isPopout()" :class="['flex justify-between mt-2 -mx-0.5', computedItems.length === 0 ? 'mb-2' : '']">
      <h4 class="flex-1 text-base font-bold leading-none text-gray-600 dark:text-gray-400 ml-[0.1rem]">
        Media Control
      </h4>
      <div class="flex-shrink-0 flex items-center space-x-2 -mt-0.5">
        <a v-if="devBannerHiddenState" @click="showDevBanner" title="Show information banner"
          class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-150">
          <InformationCircleIcon class="size-[1.125rem]"></InformationCircleIcon>
        </a>
        <a @click="openPopout" title="Popout window"
          class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-150">
          <Square2StackIcon class="size-[1.125rem]"></Square2StackIcon>
        </a>
        <a href="https://github.com/ungive/media-control-extension" target="_blank" rel="noopener noreferrer"
          title="View source code"
          class="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-all duration-150">
          <Icon icon="mdi:github" class="size-[1.25rem]" />
        </a>
      </div>
    </div>
    <div class="flow-root min-w-[28rem] max-w-[30rem]">
      <ul role="list" class="divide-y-2 divide-neutral-200 dark:divide-neutral-800/70">
        <template v-for="item in computedItems">
          <li class="py-3 group" v-if="item.state.metadata" :key="item.tabId">
            <div class="flex items-stretch">
              <div class="flex-shrink-0 cursor-pointer" @click="showTab(item.tabId)">
                <div class="relative w-28 h-28 mt-0.5 group/cover">
                  <img v-if="item.src"
                    :class="['absolute inset-0 w-full h-full rounded-sm object-cover object-center outline outline-1 outline-neutral-200 dark:outline-neutral-800 transition-all duration-75', item.muted ? 'grayscale group-hover/cover:grayscale-0 opacity-30 group-hover/cover:opacity-100' : '']"
                    :src="item.src" alt="Cover">
                  <PlayCircleIcon v-else-if="item.state.playbackState?.playing && !item.muted" class="w-28 h-28 p-3 text-neutral-800 dark:text-neutral-200"></PlayCircleIcon>
                  <PauseCircleIcon v-else-if="!item.muted" class="w-28 h-28 p-3 text-neutral-800 dark:text-neutral-200"></PauseCircleIcon>
                  <SpeakerXMarkIcon v-else class="w-28 h-28 p-3 text-neutral-800 dark:text-neutral-200"></SpeakerXMarkIcon>
                  <Transition
                    enter-active-class="transition duration-100 ease-out"
                    enter-from-class="opacity-0"
                    enter-to-class="opacity-70"
                    leave-active-class="transition duration-100 ease-in"
                    leave-from-class="opacity-70"
                    leave-to-class="opacity-0">
                    <SpeakerXMarkIcon v-if="item.src && item.muted" class="absolute inset-0 brightness-[70%] size-12 m-auto opacity-100 transition-all group-hover/cover:opacity-0 duration-100" />
                  </Transition>
                  <div v-if="item.src" class="absolute bottom-0 right-0">
                    <button @click.stop="openImageViewer(item.state.images)" target="_blank"
                      :class="['block rounded-tl-xl rounded-bl-xl rounded-tr-xl transition-all duration-300 opacity-0 group-hover/cover:opacity-100 group-hover/cover:scale-100 backdrop-blur-md bg-opacity-80 group/cover-zoom shadow-sm', item.isCoverBright ? 'bg-white' : 'bg-neutral-950']">
                      <ArrowsPointingOutIcon16 v-if="item.isCoverBright" :class="[
                        'size-[1.9rem] pl-1.5 pt-1.5 pr-1.5 pb-1.5 transition-all duration-300 shadow-sm',
                        'text-black/70 group-hover/cover-zoom:text-black/100'
                      ]" />
                      <ArrowsPointingOutIcon20 v-else :class="[
                        'size-[1.8rem] pl-1.5 pt-1.5 pr-1.5 pb-1.5 transition-all duration-300 shadow-sm',
                        'text-white/80 group-hover/cover-zoom:text-white/100'
                      ]" />
                    </button>
                  </div>
                </div>
              </div>
              <div class="flex-1 flex flex-col min-h-full min-w-0 ms-4 text-sm -translate-y-[0.0625rem]">
                <div @click="showTab(item.tabId)" class="flex-grow -translate-y-0.5 cursor-pointer">
                  <div class="flex">
                    <OverflowingText
                      v-if="item.state.metadata.artist !== undefined || item.state.metadata.album !== undefined"
                      :key="item.state.metadata.title">
                      <a @click.stop.prevent="showTab(item.tabId)" :href="getShareLink(item.state.resourceLinks)" @contextmenu="!$event.target || !($event.target as HTMLElement).getAttribute('href') ? $event.preventDefault() : null"
                        class="text-gray-900  dark:text-white border-b-1 border-transparent hover:border-gray-600 dark:hover:border-gray-400 transition-colors duration-150 leading-6 no-underline font-semibold">{{
                          item.state.metadata.title }}</a>
                    </OverflowingText>
                    <a v-else @click.stop.prevent="showTab(item.tabId)" :href="getShareLink(item.state.resourceLinks)"
                      class="text-gray-900  dark:text-white underline underline-offset-4 decoration-transparent hover:decoration-gray-600 dark:hover:decoration-gray-400 transition-colors duration-150 leading-5 font-semibold">{{
                        item.state.metadata.title }}</a>
                  </div>
                  <div class="truncate -mt-1 border-" v-if="item.state.metadata?.artist">
                    <TextWithLinks class="truncate text-gray-700 dark:text-gray-400" base-class="leading-6"
                      link-class="no-underline border-b-1 hover:text-gray-700 hover:dark:text-gray-300 border-gray-400 dark:border-gray-600 hover:border-gray-700 dark:hover:border-gray-400 transition-colors duration-200"
                      :text="item.state.metadata?.artist" :links="item.state.resourceLinks?.artistUrl" :buttons="item.metadataButtons"
                      @link-click="openLink(item.tabId, $event.text, $event.href)"/>
                  </div>
                  <div class="truncate -mt-1" v-if="item.state.metadata?.album">
                    <TextWithLinks class="truncate text-gray-700 dark:text-gray-400" base-class="leading-6"
                      link-class="no-underline border-b-1 hover:text-gray-700 hover:dark:text-gray-300 border-gray-400 dark:border-gray-600 hover:border-gray-700 dark:hover:border-gray-400 transition-colors duration-200"
                      :text="item.state.metadata?.album" :links="item.state.resourceLinks?.albumUrl" :buttons="item.metadataButtons" :match-buttons-entirely="true"
                      @link-click="openLink(item.tabId, $event.text, $event.href)"/>
                  </div>
                </div>
                <div class="text-gray-700 dark:text-gray-400"
                  v-if="item.state.playbackState && item.state.playbackState.positionTimestamp && item.state.metadata.duration">
                  <ProgressBar @seek="seekPosition(item.tabId, $event.position)" :playing="item.state.playbackState.playing" :position="item.state.playbackState.position"
                    :position-timestamp="item.state.playbackState.positionTimestamp"
                    :duration="item.state.metadata.duration" class="mt-1"></ProgressBar>
                </div>
                <div class="flex items-center mt-1 cursor-default select-none" v-if="item.state.source">
                  <div class="flex-shrink-0 flex">
                    <div class="flex-shrink-0 -ms-0.5"
                      :class="[item.controls.seekStart ? '' : 'opacity-40 cursor-default pointer-events-none']">
                      <a @click="seekStart(item.tabId)" title="Rewind"
                        class="relative flex items-center justify-center w-6 h-6 -mx-[0.25rem] -my-[0.2rem] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200">
                        <ArrowUturnLeftIcon class="size-4 mt-0.5"></ArrowUturnLeftIcon>
                      </a>
                    </div>
                    <div class="flex-shrink-0 ms-2"
                      :class="[item.controls.playPause ? '' : 'opacity-40 cursor-default pointer-events-none']">
                      <a v-if="item.state.playbackState?.playing" @click="pauseMedia(item.tabId)" title="Pause"
                        class="relative flex items-center justify-center w-6 h-6 -mx-[0.25rem] -my-[0.2rem] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200">
                        <PauseIcon class="size-4 mt-0.5"></PauseIcon>
                      </a>
                      <a v-else @click="playMedia(item.tabId)" title="Play"
                        class="relative flex items-center justify-center w-6 h-6 -mx-[0.25rem] -my-[0.2rem] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200">
                        <PlayIcon class="size-4 mt-0.5"></PlayIcon>
                      </a>
                    </div>
                    <div class="flex-shrink-0 ms-2"
                      :class="[item.controls.skip ? '' : 'opacity-40 cursor-default pointer-events-none']">
                      <a @click="nextTrack(item.tabId)" title="Next track"
                        class="relative flex items-center justify-center w-6 h-6 -mx-[0.25rem] -my-[0.2rem] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200">
                        <ForwardIcon class="size-4 mt-0.5"></ForwardIcon>
                      </a>
                    </div>
                  </div>
                  <div class="flex-1 min-w-0 ms-2.5 me-2.5" v-if="item.state.source?.siteUrl">
                    <a class="block w-full overflow-hidden text-ellipsis whitespace-nowrap no-underline text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 transition-colors duration-200"
                      @click.prevent="showTab(item.tabId)" :href="getHomepage(item.state.source.siteUrl)">{{ getHostname(item.state.source.siteUrl) }}</a>
                  </div>
                  <div class="flex-shrink-0 ms-2.5 me-0">
                    <button @click="toggleTabMute(item.tabId)" title="Mute"
                      class="relative flex items-center justify-center w-7 h-6 -mx-[0.35rem] -my-[0.2rem] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200">
                      <SpeakerWaveIcon v-if="!item.muted" class="size-4 mt-0.5"></SpeakerWaveIcon>
                      <SpeakerXMarkIcon v-else class="size-4 mt-0.5"></SpeakerXMarkIcon>
                    </button>
                  </div>
                  <div class="flex-shrink-0 ms-2.5 me-0">
                    <a :href="getHomepage(item.state.source.siteUrl)"
                      :title="getHostname(item.state.source.siteUrl)" target="_blank"
                      class="relative flex items-center justify-center w-7 h-6 -mx-[0.35rem] -my-[0.2rem]">
                      <img v-if="!hasFailedFavicon(item.state.source?.faviconUrl)"
                        class="w-4 h-4 mt-0.5 rounded-md object-cover object-center"
                        :src="item.state.source?.faviconUrl" alt="Favicon" @error="handleFaviconError(item.state.source?.faviconUrl)">
                      <GlobeAltIcon v-else class="size-4 mt-0.5"></GlobeAltIcon>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </template>
      </ul>
    </div>
    <DevBanner />
  </div>
</template>
