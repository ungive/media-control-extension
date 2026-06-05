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

const progress = ref<HTMLElement>();

function onProgressClicked(event: PointerEvent) {
  const box = progress.value!.getBoundingClientRect();
  const pixelOffset = Math.min(Math.max(event.clientX - box.x, 0), box.width);
  const fractionOffset = pixelOffset / box.width;
  const targetPosition = fractionOffset * props.duration!;
  console.log(targetPosition, Math.floor(targetPosition / 60), targetPosition % 60);
  emit('seek', {
    position: targetPosition,
    originalEvent: event
  });
}

// TODO Offset the circle by this. And use the inverse to calculate the target.
// Style: "left: (progressPercent + 2 - (3 * progressPercent / 100)) + '%'"
</script>

<template>
  <div class="flex flex-row items-stretch w-full select-none">
    <div>{{ livePositionDisplay }}</div>
    <template v-if="props.duration">
      <div @click="onProgressClicked" class="group/progress flex items-center w-full pt-0.5 cursor-pointer">
        <div ref="progress" class="bg-gray-200 w-full rounded-full h-1 mx-3 dark:bg-gray-700 relative">
          <div class="bg-gray-800 h-1 rounded-full dark:bg-gray-300 transition-opacity duration-200 group-hover/progress:opacity-70" :style="{ width: progressPercent + '%' }"></div>
          <div
            class="bg-black dark:bg-white rounded-full h-3 w-3 absolute top-0 z-10 -translate-y-1/3 -translate-x-2 transition-opacity duration-100 opacity-0 group-hover/progress:opacity-100"
            :style="{ left: progressPercent + '%' }"></div>
        </div>
      </div>
      <div>{{ formatPosition(props.duration * 1000) }}</div>
    </template>
  </div>
</template>
