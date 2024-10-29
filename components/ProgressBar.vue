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

const livePosition = ref(0);
const progressPercent = ref(0);
const livePositionDisplay = computed(() => formatPosition(livePosition.value));
let interval: NodeJS.Timeout | null = null;

function formatPosition(positionMillis: number) {
  const minutes = (positionMillis / 60000) | 0;
  const seconds = ((positionMillis % 60000) / 1000) | 0;
  return minutes.toString() + ':' + seconds.toString().padStart(2, '0');
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
    props.position * 1000, props.duration ? props.duration * 1000 : null,
    props.playing, props.positionTimestamp.getTime());
  // FIXME this is not absolutely correct, it can be off by up to a second.
  // fix this by sleeping until the next full second.
  interval = setInterval(() => {
    livePosition.value = playbackState.livePosition();
    const value = livePosition.value <= 1 ? 1 : livePosition.value;
    const rawPercent = value / (props.duration! * 1000) * 100;
    progressPercent.value = Math.min(100, Math.max(0, rawPercent));
  }, 100);
}

onMounted(() => init());
watch(() => props.position, () => init());
watch(() => props.positionTimestamp, () => init());
watch(() => props.duration, () => init());
onBeforeUnmount(() => clearCurrentInterval());
</script>

<template>
  <div class="flex flex-row w-full select-none">
    <div>{{ livePositionDisplay }}</div>
    <template v-if="props.duration">
      <div class="w-full bg-gray-200 rounded-full h-1 mt-2.5 mb-1 mx-2 dark:bg-gray-700">
        <div class="bg-gray-800 h-1 rounded-full dark:bg-gray-300" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <div>{{ formatPosition(props.duration * 1000) }}</div>
    </template>
  </div>
</template>
