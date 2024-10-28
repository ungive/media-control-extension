import { Tabs } from "wxt/browser";
import { BrowserMedia } from "@/lib/browser-media";
import { Media } from "@/lib/media";
import { Proto } from "@/lib/proto";
import { Util, BrowserType, ReverseDomain } from "@/lib/util";

const tabs: Set<number> = new Set();

function tabMediaStateToString(state: Proto.BrowserMedia.MediaState): string {
  const playbackState = state.playbackState ?
    new Media.PlaybackState(
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

// TODO forward to Music Presence desktop application.
// NOTE no rate limiting here! should be done by Music Presence.
// we don't want to add artificial delays here.
function handleTabMedia(
  tabId: number,
  tab: Tabs.Tab | null,
  state: Proto.BrowserMedia.MediaState | null
) {
  const ts = new Date(Date.now()).toISOString();
  if (state && tab && tab.url) {
    const encoded = JSON.stringify(Proto.BrowserMedia.MediaUpdate.toJSON({media: [state]}));
    console.log(ts, tabId, state.source?.reverseDomain, tabMediaStateToString(state), state, encoded);
  }
  else {
    console.log(ts, tabId, tab ? ReverseDomain.forTab(tab) : undefined, state);
  }
}

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!sender.tab?.id) {
    // Can't handle messages without a valid tab.
    return;
  }
  if (!tabs.has(sender.tab.id)) {
    // This tab is not registered.
    return;
  }
  switch (message.type) {
  case BrowserMedia.TabMessage.MediaChanged:
    const state = message.data as Proto.BrowserMedia.MediaState;
    if (state.playbackState?.playing) {
      handleTabMedia(sender.tab?.id, sender.tab, state);
    }
    else {
      handleTabMedia(sender.tab?.id, sender.tab, null);
    }
    return;
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
  tabs.add(tab.id);
  browser.tabs.sendMessage(tab.id, {
    type: BrowserMedia.ExtensionMessage.SendMediaUpdates
  });
}

async function unregisterTab(tabId: number, sendCancel: boolean = true) {
  if (!tabs.has(tabId)) {
    return; // Not registered.
  }
  tabs.delete(tabId);
  if (sendCancel) {
    browser.tabs.sendMessage(tabId, {
      type: BrowserMedia.ExtensionMessage.CancelMediaUpdates
    });
  }
  handleTabMedia(tabId, null, null);
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

async function init() {
  console.log(BrowserType[Util.getCurrentBrowser()]);
}

browser.runtime.onSuspend.addListener(async () => {
  console.log('on suspend');
});

export default defineBackground({
  persistent: true,
  main() {
    init();
  }
});
