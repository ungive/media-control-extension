<template>
  <div ref="container" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave"
    class="relative w-full overflow-hidden whitespace-nowrap">
    <span ref="text" class="inline-block will-change-transform" :style="{
      transform: `translateX(${offset}px)`,
      transition: isTransitioning ? 'transform 25ms ease' : 'none'
    }">
      <slot></slot>
    </span>
    <div v-if="isOverflowing"
      class="pointer-events-none absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--background-light)] dark:from-[var(--background-dark)] to-transparent transition-all duration-500"
      :style="{
        width: fadeWidthLeft + 'px',
        opacity: offset < 0 ? 1 : 0
      }"></div>
    <div v-if="isOverflowing"
      class="pointer-events-none absolute top-0 right-0 h-full bg-gradient-to-l from-[var(--background-light)] dark:from-[var(--background-dark)] to-transparent transition-all duration-500"
      :style="{
        width: fadeWidthRight + 'px',
        opacity: offset > minOffset ? 1 : 0
      }"></div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'

const props = defineProps({
  scrollSpeed: {
    type: Number,
    default: 0.45
  },
  pauseDurationStart: {
    type: Number,
    default: 4000
  },
  pauseDurationEnd: {
    type: Number,
    default: 2000
  }
})

const container = ref(null)
const text = ref(null)
const isOverflowing = ref(false)
const offset = ref(0)
const minOffset = ref(0)

const fullFadeWidth = 32
const halfFadeWidth = 16

const fadeWidthLeft = ref(fullFadeWidth)
const fadeWidthRight = ref(fullFadeWidth)

let isHovered = false
let direction = -1

const isTransitioning = ref(false)
const isScrollPausedAfterHover = ref(false)

const checkOverflow = () => {
  if (container.value && text.value) {
    isOverflowing.value = text.value.scrollWidth > container.value.clientWidth
    minOffset.value = Math.min(container.value.clientWidth - text.value.scrollWidth, 0)
  }
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const scrollLoop = async () => {
  if (!isOverflowing.value) return

  await wait(props.pauseDurationStart)

  while (true) {
    if (isHovered || isScrollPausedAfterHover.value) {
      await wait(100)
      continue
    }

    if (direction === -1) {
      if (offset.value > minOffset.value) {
        offset.value = Math.max(offset.value - props.scrollSpeed, minOffset.value)
        await wait(16)
      } else {
        await wait(props.pauseDurationEnd)
        direction = 1
      }
    } else {
      if (offset.value < 0) {
        offset.value = Math.min(offset.value + props.scrollSpeed, 0)
        await wait(16)
      } else {
        await wait(props.pauseDurationStart)
        direction = -1
      }
    }
  }
}

const handleMouseEnter = () => {
  isHovered = true
  fadeWidthLeft.value = halfFadeWidth
  fadeWidthRight.value = halfFadeWidth

  isTransitioning.value = true
  offset.value = 0
}

const handleMouseLeave = () => {
  isHovered = false
  fadeWidthLeft.value = fullFadeWidth
  fadeWidthRight.value = fullFadeWidth

  setTimeout(() => {
    isTransitioning.value = false
  }, 250)

  isScrollPausedAfterHover.value = true
  setTimeout(() => {
    isScrollPausedAfterHover.value = false
  }, props.pauseDurationStart)
}

onMounted(() => {
  nextTick(() => {
    checkOverflow()
    if (isOverflowing.value) {
      scrollLoop()
    }
  })
})
</script>
