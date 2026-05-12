import { storage } from '#imports';

export const devBannerHidden = storage.defineItem<boolean>('local:devBannerHidden', {
  defaultValue: false,
});
