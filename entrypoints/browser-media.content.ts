import { BrowserMedia, TabMediaObserver } from "@/lib/browser-media";

/**
 * Creates a hook for audio elements that are created in the future,
 * by adding them to the DOM, so they can be retrieved with query selectors,
 * since audio elements can play media in a user-friendly way
 * without being added to the DOM [citation needed].
 */
function hookFutureAudioElements() {
  ['play', 'pause'].forEach(method => {
    const original = Audio.prototype[method];
    Audio.prototype[method] = function () {
      const value = original.apply(this, arguments);
      if (!document.contains(this)) {
        document.body.append(this);
      }
      return value;
    };
  });
}

let mediaObserver: TabMediaObserver | null = null;

browser.runtime.onMessage.addListener(({ type }) => {
  if (!mediaObserver) {
    console.debug('missed a browser runtime message:',
      BrowserMedia.ExtensionMessage[type]);
    return;
  }
  switch (type) {
    case BrowserMedia.ExtensionMessage.SendMediaUpdates:
      mediaObserver.start();
      break;
    case BrowserMedia.ExtensionMessage.CancelMediaUpdates:
      mediaObserver.stop();
      break;
  }
});

function init() {
  hookFutureAudioElements();
  mediaObserver = new TabMediaObserver();
  // TODO handle media changes here, not in observer/tab-media.ts
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    init();
  },
});
