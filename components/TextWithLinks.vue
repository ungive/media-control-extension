<script lang="ts" setup>
import { onMounted, ref, Ref, watch } from 'vue';

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  links: Object,
  aClass: String
});

interface TextComponent {
  text: string
  href: string | null
}

const textComponents: Ref<TextComponent[]> = ref([])

function extractComponents(
  text: string,
  links: { [key: string]: string } | undefined
): TextComponent[] {
  if (links === undefined) {
    return [{ text, href: null }];
  }
  const upperText = text.toUpperCase();
  const components = new Map<number, TextComponent>();
  const takenIndices = new Set<number>();
  const entries = Object.entries(links);
  entries.sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    for (let pos = 0; ;) {
      const upperKey = key.toUpperCase();
      const index = upperText.indexOf(upperKey, pos);
      if (index < 0) break;
      pos = index + upperKey.length;
      if (!takenIndices.has(index)) {
        components.set(index, {
          text: text.substring(index, pos),
          href: value
        });
        for (let i = index; i < pos; i++) {
          takenIndices.add(i);
        }
      }
    }
  }
  const allComponents: TextComponent[] = [];
  for (let i = 0; i < text.length; i++) {
    if (components.has(i)) {
      allComponents.push(components.get(i)!);
      continue;
    }
    const start = i;
    let end = i;
    while (!takenIndices.has(end) && end < text.length) {
      end++;
    }
    if (end > start) {
      allComponents.push({
        text: text.substring(start, end),
        href: null
      });
      i = end - 1;
    }
  }
  return allComponents;
}

function init() {
  textComponents.value = extractComponents(props.text, props.links);
}

onMounted(() => init());
watch(() => props.text, () => init())
watch(() => props.links, () => init())
</script>

<template>
  <template v-for="component in textComponents">
    <a v-if="component.href !== null" :href="component.href" target="_blank" :class="aClass">{{ component.text }}</a>
    <template v-else>{{ component.text }}</template>
  </template>
</template>
