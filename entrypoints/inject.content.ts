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

// Limits for how many elements to keep. At a minimum, the stale duration should
// be set to 1 second, otherwise it's very likely that media playback stops
// working on websites that don't append media elements to the document.
const APPENDED_NODES_STALE_SECONDS: number = 30; // min:1
const APPENDED_NODES_KEEP_COUNT: number = 4; // min:0

const HIDDEN_CONTAINER_CLASS_NAME = 'media-control-extension-root'

let hiddenContainerFingerprint: string | null = null;

const appendedNodesHistory: Map<number, {
  node: Node,
  timestamp: number,
  order: number,
}> = new Map();

function removeAppendedNodeByIndex(index: number): void {
  if (!appendedNodesHistory.delete(index)) {
    return;
  }
  for (const key of [...appendedNodesHistory.keys()]) {
    const value = appendedNodesHistory.get(key)!;
    if (key > index) {
      appendedNodesHistory.delete(key);
      appendedNodesHistory.set(key - 1, value);
    }
  }
}

function findHiddenRoot(): ShadowRoot | null {
  if (hiddenContainerFingerprint === null) {
    return null;
  }
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
  if (discoveredRoot === null || discoveredRoot.shadowRoot === null) {
    return null;
  }
  return discoveredRoot.shadowRoot;
}

function createHiddenRoot(): ShadowRoot {
  hiddenContainerFingerprint = crypto.randomUUID();
  const container = createInaccessibleContainer({
    'class': HIDDEN_CONTAINER_CLASS_NAME,
    'data-fingerprint': hiddenContainerFingerprint,
  });
  document.body.appendChild(container);
  const root = container.attachShadow({ mode: 'open' });
  // Ensure that, if the site removes the element from the document, we are
  // aware of this and the history map is updated accordingly.
  new MutationObserver((mutations: MutationRecord[]) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        let found = false;
        for (const [index, entry] of appendedNodesHistory) {
          if (node === entry.node) {
            removeAppendedNodeByIndex(index);
            found = true;
            break;
          }
        }
        console.assert(found);
      }
    }
  }).observe(root, {
    childList: true,
  });
  return root;
}

function getHiddenRoot(): ShadowRoot {
  return findHiddenRoot() ?? createHiddenRoot();
}

function getNodeChildIndex(node: Node, child: Node): number | null {
  let index = 0;
  let current = node.firstChild;
  while (current) {
    if (current === child) {
      return index;
    }
    current = current?.nextSibling;
    index++;
  }
  return null;
}

function purgeAppendedNodes(root: ShadowRoot) {
  const now = new Date().getTime();
  let purgeIndices: Set<number> = new Set();
  for (const index of appendedNodesHistory.keys()) {
    purgeIndices.add(index);
  }
  // Only remove stale elements and do not remove any elements that are
  // currently playing media.
  for (const [index, item] of appendedNodesHistory) {
    const delta = now - Math.min(item.timestamp, now);
    const deltaSeconds = delta / 1000;
    if (deltaSeconds < APPENDED_NODES_STALE_SECONDS) {
      purgeIndices.delete(index);
    }
    if (item.node instanceof HTMLMediaElement && !item.node.paused) {
      purgeIndices.delete(index);
    }
  }
  // Do not remove the most recently modified elements.
  const indexTimestampPairs: [number, number][] =
    appendedNodesHistory.entries()
      .map((value): [number, number] => {
        const [index, item] = value;
        return [index, item.timestamp];
      })
      .toArray()
      .sort((a, b) => {
        return b[1] - a[1];
      });
  for (let i = 0; i < APPENDED_NODES_KEEP_COUNT; i++) {
    purgeIndices.delete(indexTimestampPairs[i][0]);
  }
  // Remove elements from the document that need to be purged.
  for (let index = 0; index < root.childNodes.length;) {
    if (!purgeIndices.has(index)) {
      // Only increment the index, when the element is kept. When it's deleted,
      // we continue at the same index, since the element after the deleted
      // element shifts to that index.
      index++;
      continue;
    }
    purgeIndices.delete(index);
    purgeIndices = new Set(purgeIndices.values().map(value => value - 1));
    const node = root.childNodes[index];
    console.assert(appendedNodesHistory.has(index));
    console.assert(node == appendedNodesHistory.get(index)!.node);
    removeAppendedNodeByIndex(index);
    node.remove();
  }
}

function updateAppendedNodesHistory(node: Node, purge: boolean = false) {
  let root = findHiddenRoot();
  if (root === null) {
    return;
  }
  for (const item of appendedNodesHistory.values()) {
    item.order += 1;
  }
  const index = getNodeChildIndex(root, node);
  if (index === null) {
    console.assert(false);
    return;
  }
  const timestamp = new Date().getTime();
  if (appendedNodesHistory.has(index)) {
    const item = appendedNodesHistory.get(index)!;
    console.assert(node === item.node);
    item.timestamp = timestamp;
    item.order = 0;
  } else {
    appendedNodesHistory.set(index, {
      node: node,
      timestamp: timestamp,
      order: 0,
    });
  }
  if (purge) {
    purgeAppendedNodes(root);
  }
}

type MediaElementEvent = keyof HTMLMediaElementEventMap | keyof HTMLVideoElementEventMap

function getMediaElementEvents(element: HTMLMediaElement): MediaElementEvent[] {
  const sets: MediaElementEvent[][] = [
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement#events
    [
      'error',
      'load',
    ],
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement#events
    [
      'abort',
      'canplay',
      'canplaythrough',
      'durationchange',
      'emptied',
      'encrypted',
      'ended',
      'error',
      'loadeddata',
      'loadedmetadata',
      'loadstart',
      'pause',
      'play',
      'playing',
      'progress',
      'ratechange',
      'seeked',
      'seeking',
      'stalled',
      'suspend',
      'timeupdate',
      'volumechange',
      'waiting',
      'waitingforkey',
    ]
  ]
  if (element instanceof HTMLVideoElement) {
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement#events
    sets.push([
      'enterpictureinpicture',
      'leavepictureinpicture',
      'resize',
    ]);
  }
  return ([] as MediaElementEvent[]).concat(...sets);
}

function insertMediaElementIntoDocument(element: HTMLMediaElement) {
  let appended = false;
  if (!findRootNodes().some(root => root.contains(element))) {
    // Append the element to the hidden root that is located inside the
    // document, so the isolated media content script can access it.
    getHiddenRoot().appendChild(element);
    // Delay time-sensitive operations.
    setTimeout(() => {
      // Any element mutation (e.g. adding a "src") should trigger an update.
      new MutationObserver(() => {
        updateAppendedNodesHistory(element);
      }).observe(element, {
        attributes: true,
      });
      // Any media event (e.g. "play" or "pause") should trigger an update.
      if (element instanceof HTMLMediaElement) {
        for (const event of getMediaElementEvents(element)) {
          element.addEventListener(event, () => {
            updateAppendedNodesHistory(element);
          });
        }
      }
    });
    appended = true;
  }
  // Delay time-sensitive operations.
  setTimeout(() => {
    // We only need to purge existing elements when new elements are appended,
    // as in other cases there is no risk of bloating the document.
    updateAppendedNodesHistory(element, appended);
  });
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
    insertMediaElementIntoDocument(audio);
    return audio;
  } as unknown as typeof Audio;
  window.Audio.prototype = OriginalAudio.prototype;
}

function installPrototypeMethodHook(prototype: any, method: string) {
  const original = prototype[method];
  prototype[method] = function () {
    // console.log('[prototype method hook]', prototype, method, document.contains(this));
    const result = original.apply(this, arguments);
    const element = this;
    console.assert(element instanceof Node);
    insertMediaElementIntoDocument(element);
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
    if (Constants.APPEND_VIDEO_ELEMENT_WHITELIST.has(getReverseDomain())) {
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
