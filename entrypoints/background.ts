import { ExtensionMessage, MediaChangedPayload, TabMessage } from "@/lib/messages";
import { BrowserMedia, Proto } from "@/lib/proto";
import { PlaybackState } from "@/lib/tab-media/playback-state";
import { Tabs } from "wxt/browser";

type TabId = number;
const tabs: Map<TabId, {
  reverseDomain: string,
  state: BrowserMedia.MediaState | null
} | null> = new Map();

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

function handleTabMedia(
  tabId: number,
  state: Proto.BrowserMedia.MediaState | null
) {
  if (!tabs.has(tabId)) {
    return; // This tab is not registered
  }
  let currentState = tabs.get(tabId);
  if (currentState === undefined) {
    console.assert(false, "There is no previous state");
    return;
  }
  if (state == null) {
    if (currentState === null) {
      return; // Nothing has changed
    }
    // Don't overwrite the reverse domain for the tab
    currentState.state = null;
  }
  else {
    if (state.source === undefined) {
      console.assert(false, "There is no source for the media state");
      return;
    }
    currentState = {
      reverseDomain: state.source?.reverseDomain,
      state: state
    };
  }
  tabs.set(tabId, currentState);

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

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!sender.tab?.id) {
    // Can't handle messages without a valid tab.
    return;
  }
  switch (message.type) {
    case TabMessage.MediaChanged:
      const payload = message.data as MediaChangedPayload;
      handleTabMedia(sender.tab.id, payload.state);
      break;
  }
});

async function registerTab(tab: Tabs.Tab) {
  if (!tab.id) {
    return console.error('failed to register tab without an id');
  }
  if (tabs.has(tab.id)) {
    return; // Already registered.
  }
  if (!tab.url) {
    return console.error('failed to register tab without a url');
  }
  tabs.set(tab.id, null);
  browser.tabs.sendMessage(tab.id, {
    type: ExtensionMessage.SendMediaUpdates
  });
}

async function unregisterTab(tabId: number, sendCancel: boolean = true) {
  if (!tabs.has(tabId)) {
    return; // Not registered.
  }
  if (sendCancel) {
    browser.tabs.sendMessage(tabId, {
      type: ExtensionMessage.CancelMediaUpdates
    });
  }
  handleTabMedia(tabId, null);
  tabs.delete(tabId);
}

async function onTabAudible(tabId: number, audible: boolean, tab: Tabs.Tab) {
  if (audible) {
    registerTab(tab);
  }
  else {
    unregisterTab(tabId);
  }
}

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId !== tab.id) {
    return;
  }
  if (changeInfo.discarded === true) {
    return unregisterTab(tabId);
  }
  if (changeInfo.audible !== undefined) {
    return onTabAudible(tabId, changeInfo.audible, tab);
  }
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  unregisterTab(tabId);
});

browser.runtime.onSuspend.addListener(async () => {
  // TODO what to do on suspend?
  console.log('on suspend');
});

async function init() {
  // console.log(BrowserType[Util.getCurrentBrowser()]);
}

export default defineBackground({
  persistent: true,
  main() {
    init();
  }
});
