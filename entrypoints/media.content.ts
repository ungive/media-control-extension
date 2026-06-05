import { MediaChangedPayload, OpenLinkPayload, PopupMessage, RuntimeMessage, SeekPositionPayload, TabMessage } from "@/lib/messages";
import { BrowserMedia } from "@/lib/proto";
import { MediaStateEvent, MediaObserver } from "@/lib/tab-media/observer";
import { findRootNodes } from "@/lib/tab-media/resource-links";

let mediaObserver: MediaObserver | null = null;
let lastInteractedMediaElement: HTMLMediaElement | null = null;

function openHrefLink(href: string) {
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

interface SeekPositionRetryConfig {
  intervalFrequency: number
  retryPeriod: number
  verifyPeriod: number
  epsilon: number
}

class SeekPositionRetryInterval {

  private timestamp: number
  private interval: NodeJS.Timeout | null = null;
  private lastUpdateTimestamp: number | null = null
  private lastMillis: number | null = null

  constructor(
    private mediaElement: HTMLMediaElement,
    private newPosition: number,
    private oldPosition: number,
    private config: SeekPositionRetryConfig,
  ) {
    this.timestamp = new Date().getTime();
    this.interval = setInterval(
      this.#intervalCallback.bind(this), this.config.intervalFrequency);
    // A short timeout seems to be required for YouTube.
    setTimeout(this.#intervalCallback.bind(this), 0);
  }

  clear() {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  #intervalCallback() {
    const epsilonSeconds = this.config.epsilon / 1000;
    const nowTimestamp = new Date().getTime();
    const startTimeDelta = nowTimestamp - this.timestamp!;
    const currentPosition = this.mediaElement.currentTime;
    const oldPositionDelta = Math.abs(currentPosition - this.oldPosition);
    const newPositionDelta = Math.abs(currentPosition - this.newPosition);
    // Seeking is successful, when the seek position was updated at
    // least once, when the adjusted current playback position is closer
    // to the target position than to the old playback position and when
    // the delta is less than the acceptable epsilon.
    let done = false;
    if (this.lastUpdateTimestamp !== null &&
        newPositionDelta < oldPositionDelta &&
        newPositionDelta < epsilonSeconds) {
      const verifyDelta = nowTimestamp - this.lastUpdateTimestamp;
      if (verifyDelta < this.config.verifyPeriod) {
        const currentPositionMillis = Math.floor(currentPosition * 1000);
        // If seeking the playback position was successful and it is
        // either at or advancing past the last seeked position, then we
        // can stop verifying and retrying early, as the player is now
        // very likely to keep playing from the target position.
        if (this.lastMillis !== null &&
            currentPositionMillis >= this.lastMillis &&
            Math.abs(currentPositionMillis - this.lastMillis) < epsilonSeconds) {
          done = true;
        } else {
          this.lastMillis = currentPositionMillis;
          return;
        }
      } else {
        done = true;
      }
    }
    if (done || startTimeDelta > this.config.retryPeriod) {
      clearInterval(this.interval!);
      this.interval = null;
      return;
    }
    this.mediaElement.currentTime = this.newPosition;
    this.lastUpdateTimestamp = new Date().getTime();
  }
}

const SEEK_POSITION_RETRY_CONFIG: SeekPositionRetryConfig = {
  // High enough that the web page is not being spammed with updates, but low
  // enough (33.3ms) that 30 FPS video will hopefully not show the next frame of
  // the old playback position
  intervalFrequency: 1000 / 30,
  retryPeriod: 1000,
  verifyPeriod: 250,
  epsilon: 500,
};

let seekPositionInterval: SeekPositionRetryInterval | null = null;

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (!mediaObserver) {
    console.assert(false, 'Media observer not initialized');
    return;
  }
  // Clear any seek retry interval, if the message controls media playback. We
  // don't want an old seek to interfere with new media control actions.
  if (seekPositionInterval) {
    switch (message.type) {
      case PopupMessage.PauseMedia:
      case PopupMessage.PlayMedia:
      case PopupMessage.SeekStart:
      case PopupMessage.SeekPosition:
      case PopupMessage.NextTrack: {
        seekPositionInterval.clear();
      }
    }
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
    case PopupMessage.SeekPosition: {
      const mediaElement = mediaObserver.mediaElement;
      const seekPositionPayload = message.payload as SeekPositionPayload;
      if (mediaElement !== null) {
        const oldPosition = mediaElement.currentTime;
        const newPosition = seekPositionPayload.position;
        if (mediaElement.paused) {
          mediaElement.play();
        }
        if (!mediaElement.paused) {
          // NOTE If this ever does not work, we could use the current progress
          // element and click on the respective position in the DOM instead.
          seekPositionInterval = new SeekPositionRetryInterval(
            mediaElement, newPosition, oldPosition, SEEK_POSITION_RETRY_CONFIG);
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
