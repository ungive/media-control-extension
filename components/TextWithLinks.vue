<script lang="ts" setup>
import { onMounted, ref, Ref, watch } from 'vue';

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  links: Object,
  buttons: Set<string>,
  matchButtonsEntirely: Boolean,
  baseClass: String,
  linkClass: String
});

export interface LinkClickEvent {
  text: string
  href: string | undefined
  originalEvent: MouseEvent
}

const emit = defineEmits<{
  (e: 'link-click', payload: LinkClickEvent): void
}>();

interface TextComponent {
  text: string
  clickable: boolean
  href: string | undefined
}

const textComponents: Ref<TextComponent[]> = ref([])

function extractComponents(
  text: string,
  links: { [key: string]: string } | undefined,
  buttons: Set<string> | undefined,
  matchButtonsEntirely: boolean,
): TextComponent[] {
  if (links === undefined) {
    return [
      {
        text,
        clickable: false,
        href: undefined,
      }
    ];
  }
  text = text.normalize('NFC');
  text = text.trim();
  const normalizedLinks: typeof links = {}
  for (const key in links) {
    normalizedLinks[key.normalize('NFC')] = links[key];
  }
  const upperText = text.toUpperCase();
  const components = new Map<number, TextComponent>();
  const takenIndices = new Set<number>();
  const entries = Object.entries(normalizedLinks);
  entries.sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    for (let pos = 0; ;) {
      const upperKey = key.trim().toUpperCase();
      const index = upperText.indexOf(upperKey, pos);
      if (index < 0) break;
      pos = index + upperKey.length;
      if (!takenIndices.has(index)) {
        components.set(index, {
          text: text.substring(index, pos),
          clickable: true,
          href: value,
        });
        for (let i = index; i < pos; i++) {
          takenIndices.add(i);
        }
      }
    }
  }
  if (buttons !== undefined) {
    const buttonItems: string[] = Array.from(buttons);
    buttonItems.sort((a, b) => b.length - a.length);
    for (const key of buttonItems) {
      if (matchButtonsEntirely) {
        if (key.trim().toUpperCase() === upperText) {
          components.set(0, {
            text: text,
            clickable: true,
            href: undefined,
          });
          for (let i = 0; i < text.length; i++) {
            takenIndices.add(i);
          }
          break;
        }
      } else {
        // FIXME Copy-pasted...
        for (let pos = 0; ;) {
          const upperKey = key.trim().toUpperCase();
          const index = upperText.indexOf(upperKey, pos);
          if (index < 0) break;
          pos = index + upperKey.length;
          if (!takenIndices.has(index)) {
            components.set(index, {
              text: text.substring(index, pos),
              clickable: true,
              href: undefined,
            });
            for (let i = index; i < pos; i++) {
              takenIndices.add(i);
            }
          }
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
        clickable: false,
        href: undefined,
      });
      i = end - 1;
    }
  }
  return allComponents;
}

function init() {
  textComponents.value = extractComponents(
    props.text,
    props.links,
    props.buttons,
    props.matchButtonsEntirely
  );
}

onMounted(() => init());
watch(() => props.text, () => init())
watch(() => props.links, () => init())

function handleClick(
  text: string,
  href: string | undefined = undefined,
  event: MouseEvent
) {
  event.preventDefault();
  event.stopPropagation();
  emit('link-click', {
    text,
    href,
    originalEvent: event
  });
}
</script>

<template>
  <div v-bind="$attrs">
    <template v-for="component in textComponents">
      <a @click="handleClick(component.text, component.href, $event)" v-if="component.clickable && component.href !== undefined" :href="component.href" target="_blank" :class="[baseClass, linkClass]">{{
        component.text
      }}</a>
      <button @click="handleClick(component.text, undefined, $event)" v-else-if="component.clickable && component.href === undefined">
        <span :class="[baseClass, linkClass]">{{ component.text }}</span>
      </button>
      <span v-else :class="baseClass">{{ component.text }}</span>
    </template>
  </div>
</template>
