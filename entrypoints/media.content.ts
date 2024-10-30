import { ExtensionMessage, MediaChangedPayload, PopupMessage, RuntimeMessage, TabMessage } from "@/lib/messages";
import { BrowserMedia } from "@/lib/proto";
import { TabMediaObserver } from "@/lib/tab-media/observer";

let mediaObserver: TabMediaObserver | null = null;
let lastInteractedMediaElement: HTMLMediaElement | null = null;

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (!mediaObserver) {
    console.assert(false, 'Media observer not initialized');
    return;
  }
  switch (message.type) {
    case ExtensionMessage.SendMediaUpdates:
      lastInteractedMediaElement = null;
      mediaObserver.restart();
      break;
    case ExtensionMessage.CancelMediaUpdates:
      mediaObserver.stop();
      lastInteractedMediaElement = null;
      break;
    case PopupMessage.PauseMedia: {
      const mediaElement = mediaObserver.mediaElement;
      if (mediaElement !== null && !mediaElement.paused) {
        mediaElement.pause();
        if (mediaElement.paused) {
          // Always overwrite the last interacted element with this element
          // because when media is playing this is definitely the correct one.
          lastInteractedMediaElement = mediaElement;
        }
      }
      break;
    }
    case PopupMessage.PlayMedia: {
      const mediaElement = mediaObserver.mediaElement;
      if (mediaElement !== null && mediaElement.paused) {
        mediaElement.play();
        if (lastInteractedMediaElement === null && !mediaElement.paused) {
          // Only set the last interacted element if it's not already set
          // and triggering its playing state ended up doing something.
          lastInteractedMediaElement = mediaElement;
        }
      }
      else if (lastInteractedMediaElement !== null && lastInteractedMediaElement.paused) {
        lastInteractedMediaElement.play();
        if (lastInteractedMediaElement.paused) {
          // Still paused, so remove it.
          lastInteractedMediaElement = null;
        }
      }
      break;
    }
    case PopupMessage.SeekStart: {
      const mediaElement = mediaObserver.mediaElement;
      if (mediaElement !== null) {
        if (mediaElement.paused) {
          mediaElement.play();
        }
        if (!mediaElement.paused) {
          mediaElement.currentTime = 0;
        }
      }
      break;
    }
    case PopupMessage.NextTrack: {
      const mediaElement = mediaObserver.mediaElement;
      if (mediaElement !== null) {
        if (mediaElement.paused) {
          mediaElement.play();
        }
        if (!mediaElement.paused) {
          // Add a few seconds so it doesn't play the last few seconds.
          mediaElement.currentTime = mediaElement.duration + 2;
        }
      }
      break;
    }
  }
});

function onMediaUpdated(state: BrowserMedia.MediaState) {
  browser.runtime.sendMessage({
    type: TabMessage.MediaChanged,
    payload: {
      state,
      hasControls: mediaObserver?.mediaElement !== null
        || lastInteractedMediaElement !== null
    } as MediaChangedPayload,
  } as RuntimeMessage);
}

function injectAudioHook() {
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/inject.js');
  document.head.appendChild(script);
}

function init() {
  injectAudioHook();
  mediaObserver = new TabMediaObserver();
  mediaObserver.addEventListener(onMediaUpdated);
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    init();
  },
});
