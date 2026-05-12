<script setup lang="ts">
import { devBannerHidden } from '@/lib/util/storage';
import { EyeSlashIcon } from '@heroicons/vue/16/solid';

const hidden = ref(false);

onMounted(async () => {
  hidden.value = await devBannerHidden.getValue()
});

async function closeBanner() {
  hidden.value = true
  await devBannerHidden.setValue(true)
}

devBannerHidden.watch((value) => {
  hidden.value = value;
});
</script>

<template>
  <div v-if="!hidden"
    class="flex items-start justify-between gap-2 text-[0.8rem] mt-1.5 px-2 pt-0.5 pb-0.5 mb-1 bg-[#f6e9c7] dark:bg-[#494339] text-[#504937] dark:text-[#e0e3ca] rounded-md">
    <div>
      This extension is still in development.
      <a href="https://github.com/ungive/media-control-extension/issues" class="underline hover:opacity-80" target="_blank">
        Report an issue
      </a>
    </div>
    <button type="button" @click="closeBanner" class="shrink-0 mt-[1px] hover:opacity-70" aria-label="Close banner">
      <EyeSlashIcon class="size-[1rem] m-0.5" />
    </button>
  </div>
</template>
