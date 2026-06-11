import { ActionSeekToPayload, MediaSessionMessage, WindowMessage, WindowResponseMessage } from "@/lib/messages";
import { Constants } from "@/lib/tab-media/constants";
import { findRootNodes } from "@/lib/tab-media/resource-links";
import { getReverseDomain } from "@/lib/util/document";

function makeElementInaccessible(element: HTMLElement) {
  const attributeNames = element.getAttributeNames();
  for (const attribute of attributeNames) {
    element.removeAttribute(attribute);
  }
  element.setAttribute("hidden", "");
  element.setAttribute("aria-hidden", "true");
  element.inert = true;
  Object.assign(element.style, {
    position: "fixed",
    left: "-1000000000px",
    top: "0",
    width: "0",
    height: "0",
    display: "none",
    pointerEvents: "none",
    zIndex: "-2147483648",
  });
}

function createInaccessibleContainer(
  attributes: { [key: string]: string },
): HTMLElement {
  const container = document.createElement("div");
  const resetContainer = () => {
    makeElementInaccessible(container);
    for (const [attribute, value] of Object.entries(attributes)) {
      container.setAttribute(attribute, value);
    }
  };
  resetContainer();
  let mutationObserver: MutationObserver;
  const observeContainer = () => {
    mutationObserver.observe(container, {
      attributes: true,
    });
  };
  mutationObserver = new MutationObserver(() => {
    // Prevent infinite recursion by disconnecting and reconnecting after.
    mutationObserver.disconnect();
    resetContainer();
    observeContainer();
  });
  observeContainer();
  return container;
}

const HIDDEN_CONTAINER_CLASS_NAME = 'media-control-extension-container'
let hiddenContainerFingerprint: string | null = null;

function getHiddenRoot(): ShadowRoot {
  if (hiddenContainerFingerprint !== null) {
    const elements: NodeListOf<Element> =
      document.body.querySelectorAll(
        `.${HIDDEN_CONTAINER_CLASS_NAME}` +
        `[data-fingerprint="${hiddenContainerFingerprint}"]`);
    let discoveredRoot: HTMLElement | null = null;
    for (const element of elements) {
      if (element instanceof HTMLElement) {
        discoveredRoot = element;
        break;
      }
    }
    if (discoveredRoot !== null && discoveredRoot.shadowRoot !== null) {
      return discoveredRoot.shadowRoot;
    }
  }
  hiddenContainerFingerprint = crypto.randomUUID();
  const root = createInaccessibleContainer({
    'class': HIDDEN_CONTAINER_CLASS_NAME,
    'data-fingerprint': hiddenContainerFingerprint,
  });
  document.body.appendChild(root);
  return root.attachShadow({ mode: 'open' });
}

// Overrides the Audio class constructor so that any newly created Audio element
// on the page is immediately appended to the document body. This is necessary
// on pages that autoplay audio without calling Audio.play() first. An example
// website where this is the case is https://deezer.com.
function installAudioConstructorHook() {
  const OriginalAudio = window.Audio;
  window.Audio = function (...args: ConstructorParameters<typeof Audio>) {
    const audio = new OriginalAudio(...args);
    // console.log('[audio constructor]', audio);
    getHiddenRoot().appendChild(audio);
    return audio;
  } as unknown as typeof Audio;
  window.Audio.prototype = OriginalAudio.prototype;
}

function installPrototypeMethodHook(prototype: any, method: string) {
  const original = prototype[method];
  prototype[method] = function () {
    // console.log('[prototype method hook]', prototype, method, document.contains(this));
    const result = original.apply(this, arguments);
    console.assert(this instanceof Node);
    if (!findRootNodes().some(root => root.contains(this))) {
      getHiddenRoot().appendChild(this);
    }
    return result
  };
}

// Appends media elements that are being played or paused to the document body
// so that they can be found and used by the isolated content script. An example
// website that needs this injection is https://soundcloud.com, without it media
// wouldn't be detected immediately when it starts playing. We do not naively
// install the hook on video elements of all pages, as this can break websites
// (e.g. https://reddit.com), since video elements are usually visible on the
// page. For now we can assume that when a video element plays, the website will
// also display it somewhere and it will therefore be in the DOM now or in the
// very near future. We do however install the hook for video elements on sites
// that are known to play media through a video element that is never appended
// to the document (e.g. https://open.spotify.com).
function installMediaElementPrototypeMethodHooks() {
  ['play', 'pause'].forEach(method => {
    installPrototypeMethodHook(HTMLAudioElement.prototype, method);
    if (Constants.VIDEO_ELEMENT_APPEND_WHITELIST.has(getReverseDomain())) {
      installPrototypeMethodHook(HTMLVideoElement.prototype, method);
    }
  });
}

type MediaSessionActions = Partial<Record<MediaSessionAction, MediaSessionActionHandler>>

const mediaSessionActions: MediaSessionActions = {}

function installMediaSessionSetActionHandlerHooks() {
  const original = MediaSession.prototype.setActionHandler;
  MediaSession.prototype.setActionHandler = function (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null
  ): void {
    // console.log('[media session action handler]', action, handler);
    if (handler !== null) {
      mediaSessionActions[action] = handler
    } else {
      delete mediaSessionActions[action];
    }
    return original.call(this, action, handler);
  };
}

function installHooks() {
  installAudioConstructorHook();
  installMediaElementPrototypeMethodHooks();
  installMediaSessionSetActionHandlerHooks();
}

function isWindowMessage(message: unknown): message is WindowMessage {
  return typeof message === "object" && message !== null &&
    "id" in message && "type" in message;
}

function installMessageHandlers() {
  window.addEventListener("message", async (event: MessageEvent) => {
    if (event.source !== window) {
      return;
    }
    const message = event.data;
    if (!isWindowMessage(message)) {
      return;
    }
    let called = false;
    const call = async (details: MediaSessionActionDetails) => {
      const callable = mediaSessionActions[details.action];
      if (callable) {
        try {
          const value: unknown = callable(details);
          // In case the website returns a Promise, we should await it.
          const result = await value;
          called = true;
        } catch (e) {
          console.error(e);
        }
      }
    }
    switch (message.type) {
      case MediaSessionMessage.ActionPlay: {
        await call({ action: 'play' });
        break;
      }
      case MediaSessionMessage.ActionPause: {
        await call({ action: 'pause' });
        break;
      }
      case MediaSessionMessage.ActionPreviousTrack: {
        await call({ action: 'previoustrack' });
        break;
      }
      case MediaSessionMessage.ActionNextTrack: {
        await call({ action: 'nexttrack' });
        break;
      }
      case MediaSessionMessage.ActionSeekTo: {
        const payload = message.payload as ActionSeekToPayload;
        await call({
          action: 'seekto',
          seekTime: payload.position,
        });
        break;
      }
    }
    window.postMessage({
      messageId: message.id,
      ok: called,
    } as WindowResponseMessage);
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: "document_start",
  // The injection code needs to be executed directly within the web page, i.e.
  // in the main world, otherwise the changes are not visible to the page code.
  world: "MAIN",
  main() {
    installHooks();
    installMessageHandlers();
  },
});
