import { CurrentMediaPayload, ExtensionMessage, MediaChangedPayload, MediaControlCapabilities, PopoutMessage, PopoutStatePaylaod as PopoutStatePayload, PopupMessage, RuntimeMessage, TabMessage, WindowSizePayload } from "@/lib/messages";
import { BrowserMedia, Proto } from "@/lib/proto";
import { PlaybackState } from "@/lib/tab-media/playback-state";
import { Browser } from "wxt/browser";

type TabId = number;
const tabs: Map<TabId, {
  reverseDomain: string
  state: BrowserMedia.MediaState | null
  controls: MediaControlCapabilities
} | null> = new Map();

let connectedPopups = 0;

let popoutWindowId: number | undefined = undefined;

function tabMediaStateToString(state: Proto.BrowserMedia.MediaState): string {
  const playbackState = state.playbackState ?
    new PlaybackState(
      state.playbackState?.position * 1000,
      state.metadata?.duration ? state.metadata?.duration * 1000 : null,
      state.playbackState?.playing,
      state.playbackState?.positionTimestamp?.getTime()
    ) : null;
  return state.metadata?.title
    + " by " + state.metadata?.artist
    + " on " + state.metadata?.album
    + " [" + playbackState?.livePosition() + "ms"
    + "/" + playbackState?.duration + "ms"
    + " " + (playbackState?.playing ? "playing" : "paused")
    + "]";
}

async function updateTabMedia() {
  let hasExtensionPopup: boolean = connectedPopups > 0

  // Count how many tabs are playing media and collect the metadata, if there
  // is any extension popup that could display that data.
  let currentMediaCount: number = 0
  const currentMediaPayload: CurrentMediaPayload = { media: [] }
  for (const [tabId, media] of tabs) {
    if (media?.state) {
      currentMediaCount += 1;
      if (hasExtensionPopup) {
        currentMediaPayload.media.push({
          tabId,
          stateJson: BrowserMedia.MediaState.toJSON(media.state) as object,
          controls: media.controls
        });
      }
    }
  }

  // // Update the counter value on the extension icon.
  // const browserAction = browser.action ?? browser.browserAction;
  // if (currentMediaCount > 0) {
  //   const text = currentMediaCount > 9 ? '9+' : String(currentMediaCount);
  //   browserAction.setBadgeBackgroundColor({ color: '#222' });
  //   browserAction.setBadgeText({ text });
  // } else {
  //   browserAction.setBadgeText({
  //     text: undefined,
  //   });
  // }

  // Update the extension popup, if there is any.
  if (hasExtensionPopup) {
    await browser.runtime.sendMessage({
      type: ExtensionMessage.CurrentMedia,
      payload: currentMediaPayload
    } as RuntimeMessage);
  }
}

async function handleTabMedia(
  tabId: number,
  state: Proto.BrowserMedia.MediaState | null,
  controls: MediaControlCapabilities | null = null
) {
  if (!tabs.has(tabId)) {
    tabs.set(tabId, null);
  }
  let currentState = tabs.get(tabId);
  if (currentState === undefined) {
    console.assert(false, "There is no previous state");
    return;
  }
  if (state === null) {
    if (currentState === null) {
      return; // Nothing has changed
    }
    // Don't overwrite the reverse domain for the tab
    currentState.state = null;
  }
  else if (controls === null) {
    console.error("State and controls must both be non-null")
    return;
  }
  else {
    if (state.source === undefined) {
      console.assert(false, "There is no source for the media state");
      return;
    }
    currentState = {
      reverseDomain: state.source?.reverseDomain,
      state: state,
      controls
    };
  }
  tabs.set(tabId, currentState);

  // Inform open popup views about current media.
  updateTabMedia();

  // logging
  const ts = new Date(Date.now()).toISOString();
  if (state) {
    const encoded = JSON.stringify(Proto.BrowserMedia.MediaUpdate.toJSON({ media: [state] }));
    console.log(ts, tabId, state.source?.reverseDomain, tabMediaStateToString(state), state, encoded);
  }
  else {
    console.log(ts, tabId, currentState.reverseDomain, state);
  }
}

browser.runtime.onMessage.addListener(async (message: RuntimeMessage, sender, sendResponse) => {
  switch (message.type) {
    // Media changed in a tab
    case TabMessage.MediaChanged:
      if (sender.tab?.id !== undefined) {
        const mediaChangedPayload = message.payload as MediaChangedPayload;
        handleTabMedia(
          sender.tab.id,
          mediaChangedPayload.stateJson
            ? BrowserMedia.MediaState.fromJSON(mediaChangedPayload.stateJson)
            : null,
          mediaChangedPayload.controls
        );
      }
      break;
    // The popup requests currently playing media
    case PopupMessage.GetCurrentMedia:
      updateTabMedia();
      break;
    // The popout reports its desired window size
    case PopoutMessage.WindowSize:
      const windowSizePayload = message.payload as WindowSizePayload
      if (popoutWindowId !== undefined) {
        browser.windows.update(popoutWindowId, {
          width: Math.max(0, Math.ceil(windowSizePayload.width)),
          height: Math.max(0, Math.ceil(windowSizePayload.height)),
        });
      }
      break;
    // Open the popup in a popout window
    case PopupMessage.OpenPopout:
      if (popoutWindowId !== undefined) {
        focusPopout()
      } else {
        createPopout()
      }
      break;
    // A request from a popup whether a popout window exists
    case PopupMessage.GetPopoutState:
      // We cannot use sendResponse with possibly multiple popup instances
      // because that will lead to the response being emtpy (for some reason).
      browser.runtime.sendMessage({
        type: ExtensionMessage.PopoutState,
        payload: {
          result: await hasPopoutWindow()
        } as PopoutStatePayload
      } as RuntimeMessage)
      break;
  }
});

async function unregisterTab(tabId: number, sendCancel: boolean = true) {
  if (!tabs.has(tabId)) {
    return; // Not registered.
  }
  handleTabMedia(tabId, null);
  tabs.delete(tabId);
}

// const completedTabs = new Set<number>();

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // FIXME Navigating to a different page does not unload the media
  // FIXME Reloading the page completely does not unload the media
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  unregisterTab(tabId);
});

browser.runtime.onSuspend.addListener(async () => {
  // TODO what to do on suspend?
  console.log('on suspend');
});

async function init() {
  // Observe and listen for popups that connect/disconnect i.e. open/close.
  browser.runtime.onConnect.addListener(port => {
    connectedPopups += 1;
    port.onDisconnect.addListener(() => {
      const newValue = connectedPopups - 1;
      if (newValue < 0) {
        console.assert(false, "Number of connected popups cannot be negative");
      }
      connectedPopups = Math.max(0, newValue);
    })
  });
}

function onPopoutOpened() {
  console.assert(popoutWindowId !== undefined)
  browser.runtime.sendMessage({
    type: ExtensionMessage.PopoutOpened
  } as RuntimeMessage)
}

function onPopoutClosed() {
  console.assert(popoutWindowId === undefined)
  browser.runtime.sendMessage({
    type: ExtensionMessage.PopoutClosed
  } as RuntimeMessage)
}

browser.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === popoutWindowId) {
    popoutWindowId = undefined;
    onPopoutClosed();
  }
})

async function hasPopoutWindow(): Promise<boolean> {
  if (popoutWindowId === undefined) {
    return false;
  }
  try {
    await browser.windows.get(popoutWindowId);
    return true;
  } catch (err) {
    popoutWindowId = undefined;
    onPopoutClosed();
    return false;
  }
}

async function createPopout() {
  if (popoutWindowId !== undefined) {
    console.warn("Attempting to create a popout window while one already exists");
    return;
  }
  const popup = await browser.windows.create({
    url: browser.runtime.getURL('/popup.html?popout=1'),
    type: 'popup',
    width: 528,
    height: 100,
  });
  if (popup !== undefined) {
    popoutWindowId = popup.id;
    onPopoutOpened();
  } else {
    console.error("failed to open popout window");
  }
}

async function focusPopout() {
  if (popoutWindowId === undefined) {
    console.warn("Attemptd to focus the popout while it does not exist")
    return
  }
  await browser.windows.update(popoutWindowId, {
    focused: true
  });
}

export default defineBackground({
  persistent: true,
  main() {
    init();
  }
});
