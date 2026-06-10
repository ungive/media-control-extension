<script lang="ts" setup>
import { PlaybackState } from '@/lib/tab-media/playback-state';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  playing: Boolean,
  position: {
    type: Number,
    required: true
  },
  positionTimestamp: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: false
  }
});

export interface SeekEvent {
  position: number
  originalEvent: MouseEvent
}

const emit = defineEmits<{
  (e: 'seek', position: SeekEvent): void
}>();

const data = ref({
  playing: props.playing,
  position: props.position,
  positionTimestamp: props.positionTimestamp,
});
const livePosition = ref(0);
const livePositionDisplay = computed(() => formatPosition(livePosition.value));
const progressPercent = ref(0);
const progressPercentDrag: Ref<number | null> = ref(null);
let interval: NodeJS.Timeout | null = null;

function formatPosition(positionMillis: number) {
  const days = (positionMillis / (24 * 60 * 60 * 1000)) | 0;
  const hours = ((positionMillis / (60 * 60 * 1000)) % 24) | 0;
  const minutes = ((positionMillis / (60 * 1000)) % 60) | 0;
  const seconds = ((positionMillis % (60 * 1000)) / 1000) | 0;
  const parts = [];
  if (days > 0) {
    parts.push(days.toString());
  }
  if (parts.length > 0 || hours > 0) {
    parts.push(hours.toString());
  }
  parts.push(minutes.toString());
  parts.push(seconds.toString());
  for (let i = 1; i < parts.length; i++) {
    parts[i] = parts[i].padStart(2, '0');
  }
  return parts.join(':');
}

function clearCurrentInterval() {
  if (interval !== null) {
    clearInterval(interval);
    interval = null;
  }
}

function init() {
  clearCurrentInterval();
  const playbackState = new PlaybackState(
    data.value.position * 1000, props.duration ? props.duration * 1000 : null,
    data.value.playing, data.value.positionTimestamp.getTime());
  // FIXME this is not absolutely correct, it can be off by up to a second.
  // fix this by sleeping until the next full second.
  interval = setInterval(() => {
    livePosition.value = playbackState.livePosition();
    const value = livePosition.value <= 1 ? 1 : livePosition.value;
    let rawPercent = value / (props.duration! * 1000) * 100;
    rawPercent = Math.min(100, Math.max(0, rawPercent));
    // Round to a single digit after the comma to prevent.
    rawPercent = Math.floor(rawPercent * 10) / 10;
    progressPercent.value = rawPercent;
  }, 100);
}

onMounted(() => {
  init();
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
});
watch(() => props.playing, (value) => {
  data.value.playing = value;
});
watch(() => props.position, (value) => {
  data.value.position = value;
});
watch(() => props.positionTimestamp, (value) => {
  data.value.positionTimestamp = value;
  // Reset this to the actual playback state whenever the position timestamp
  // changes. The playback state may be paused temporarily after scrubbing the
  // timeline, see onWindowMouseUp().
  data.value.playing = props.playing;
});
watch(() => data.value.playing, () => init());
watch(() => data.value.position, () => init());
watch(() => data.value.positionTimestamp, () => init());
watch(() => props.duration, () => init());
onBeforeUnmount(() => {
  clearCurrentInterval();
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onWindowMouseUp);
});

const progress = ref<HTMLElement>();
const positionOverlay = ref<HTMLElement>();

function translateProgressClick(event: MouseEvent): {
  pixelOffset: number
  fractionOffset: number
  playbackPosition: number
} {
  const box = progress.value!.getBoundingClientRect();
  const pixelOffset = Math.min(Math.max(event.clientX - box.x, 0), box.width);
  const fractionOffset = Math.min(Math.max(pixelOffset / box.width, 0.0), 1.0);
  const playbackPosition = fractionOffset * props.duration!;
  return {
    pixelOffset,
    fractionOffset,
    playbackPosition
  };
}

const isMouseOver = ref(false);
const isMouseDown = ref(false);

function onProgressMouseDown() {
  isMouseDown.value = true;
}

function onWindowMouseUp(event: MouseEvent) {
  if (!isMouseDown.value) {
    return;
  }
  isMouseDown.value = false;
  const translated = translateProgressClick(event);
  data.value.playing = false;
  data.value.position = translated.playbackPosition;
  data.value.positionTimestamp = new Date();
  if (progressPercentDrag.value !== null) {
    progressPercent.value = progressPercentDrag.value;
    progressPercentDrag.value = null;
  }
  emit('seek', {
    // Floor the value to prevent the player from rounding it up.
    position: Math.floor(translated.playbackPosition),
    originalEvent: event
  });
}

function onWindowMouseMove(event: MouseEvent) {
  const translated = translateProgressClick(event);
  if (isMouseOver.value || isMouseDown.value) {
    positionOverlay.value!.innerText = formatPosition(translated.playbackPosition * 1000);
    positionOverlay.value!.style.left = translated.pixelOffset + 'px';
  }
  if (isMouseDown.value) {
    progressPercentDrag.value = translated.fractionOffset * 100;
  }
}

// TODO Offset the circle by this. And use the inverse to calculate the target.
// Style: "left: (progressPercent + 2 - (3 * progressPercent / 100)) + '%'"
</script>

<template>
  <div class="flex flex-row items-stretch w-full select-none">
    <div>{{ livePositionDisplay }}</div>
    <template v-if="props.duration">
      <div @mousedown="onProgressMouseDown" @mouseenter="isMouseOver = true" @mouseleave="isMouseOver = false"
        class="group/progress flex items-center w-full pt-0.5 cursor-pointer">
        <div ref="progress" class="bg-gray-200 dark:bg-gray-700 w-full rounded-full h-1 mx-3 relative">
          <div class="bg-gray-800 h-1 rounded-full dark:bg-gray-300 transition-opacity duration-200"
            :style="{ width: (progressPercentDrag !== null ? progressPercentDrag : progressPercent) + '%', opacity: (isMouseOver || isMouseDown) ? '0.7' : '1' }">
          </div>
          <div
            class="bg-black dark:bg-white rounded-full h-3 w-3 absolute top-0 z-10 -translate-y-1/3 -translate-x-2 transition-opacity duration-100 delay-75 opacity-0"
            :style="{ left: (progressPercentDrag !== null ? progressPercentDrag : progressPercent) + '%', opacity: (isMouseOver || isMouseDown) ? '1' : '0' }">
          </div>
          <div ref="positionOverlay"
            class="bg-gray-200 dark:bg-[#3a4048] dark:text-gray-200 px-2.5 pb-[1pt] rounded-full text-[0.825rem] absolute -translate-x-1/2 -top-[2.2rem] shadow-2xl transition-opacity duration-100 delay-75 opacity-0 pointer-events-none z-10"
            :style="{ opacity: (isMouseOver || isMouseDown) ? '1' : '0' }">
          </div>
        </div>
      </div>
      <div>{{ formatPosition(props.duration * 1000) }}</div>
    </template>
  </div>
</template>
