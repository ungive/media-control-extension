import { ExtensionMessage, MediaChangedPayload, OpenLinkPayload, PopupMessage, RuntimeMessage, TabMessage } from "@/lib/messages";
import { BrowserMedia } from "@/lib/proto";
import { MediaStateEvent, MediaObserver } from "@/lib/tab-media/observer";
import { findRootNodes } from "@/lib/tab-media/resource-links";

let mediaObserver: MediaObserver | null = null;
let lastInteractedMediaElement: HTMLMediaElement | null = null;

function openHrefLink(href: string) {
  console.log(href);
  href = href.trim();
  if (href.length === 0) {
    console.assert(false, "The link's href is empty");
    return;
  }
  // Search in all root nodes since some web pages might uses shadow roots.
  const roots = findRootNodes()
  for (const root of roots) {
    const elements = root.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const element of elements) {
      // Compare the href URL like this, so that it's automatically resolved to
      // the final URL, since anchor elements may contain relative paths.
      if (element.href === href) {
        element.click();
        return;
      }
    }
  }
}

function openTextLink(text: string) {
  text = text.trim();
  const buttons = document.querySelectorAll("button");
  for (const button of buttons) {
    const innerText = button.innerText.trim();
    if (innerText.length === 0) {
      continue;
    }
    if (innerText === text) {
      button.click();
      break;
    }
  }
}

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (!mediaObserver) {
    console.assert(false, 'Media observer not initialized');
    return;
  }
  switch (message.type) {
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
        if (isNaN(mediaElement.duration)) {
          console.error("Cannot skip to the next track: The duration is not a number");
          break;
        }
        if (!isFinite(mediaElement.duration)) {
          console.error("Cannot skip to the next track: The duration is not finite");
          break;
        }
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
    case PopupMessage.OpenLink: {
      const openLinkPayload = message.payload as OpenLinkPayload;
      if (openLinkPayload.href !== undefined) {
        openHrefLink(openLinkPayload.href);
      } else {
        openTextLink(openLinkPayload.text);
      }
      break;
    }
  }
});

function onMediaUpdated(event: MediaStateEvent | null) {
  // TODO Do we need this check?
  // || lastInteractedMediaElement !== null
  const hasMediaElement = mediaObserver?.mediaElement !== null
  browser.runtime.sendMessage({
    type: TabMessage.MediaChanged,
    payload: {
      stateJson: event ? BrowserMedia.MediaState.toJSON(event.state) as object : null,
      controls: {
        playPause: hasMediaElement,
        seekStart: hasMediaElement,
        skip: mediaObserver?.mediaElement !== null &&
          mediaObserver?.mediaElement.duration !== undefined &&
          !isNaN(mediaObserver?.mediaElement.duration) &&
          isFinite(mediaObserver?.mediaElement.duration)
      },
      metadataButtons: event ? event.clientState.metadataButtons : [],
    } as MediaChangedPayload,
  } as RuntimeMessage);
}

function init() {
  mediaObserver = new MediaObserver();
  mediaObserver.addEventListener(onMediaUpdated);
  mediaObserver.start();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: "document_end",
  main() {
    init();
  },
});
