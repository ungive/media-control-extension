import { ExtensionMessage, MediaChangedPayload, RuntimeMessage, TabMessage } from "@/lib/messages";
import { BrowserMedia } from "@/lib/proto";
import { TabMediaObserver } from "@/lib/tab-media/observer";

/**
 * Creates a hook for audio elements that are created in the future,
 * by adding them to the DOM, so they can be retrieved with query selectors,
 * since audio elements can play media in a user-friendly way without being
 * added to the DOM [citation needed].
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

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (!mediaObserver) {
    console.assert(false, 'Media observer not initialized');
    return;
  }
  switch (message.type) {
    case ExtensionMessage.SendMediaUpdates:
      mediaObserver.restart();
      break;
    case ExtensionMessage.CancelMediaUpdates:
      mediaObserver.stop();
      break;
  }
});

function onMediaUpdated(state: BrowserMedia.MediaState) {
  browser.runtime.sendMessage({
    type: TabMessage.MediaChanged,
    payload: { state } as MediaChangedPayload,
  } as RuntimeMessage);
}

function init() {
  hookFutureAudioElements();
  mediaObserver = new TabMediaObserver();
  mediaObserver.addEventListener(onMediaUpdated);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    init();
  },
});
