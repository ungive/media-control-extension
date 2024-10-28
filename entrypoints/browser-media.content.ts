import { AriaProgressElementFactory, BrowserMedia, Constants, ElementGroupObserver, EventListenerObservationStrategy, IElementSource, InputRangeProgressElementFactory, NodeMutationObservationStrategy, PlaybackPositionProgressElementObserver, ProgressElement, ProgressElementFactory, TabMediaElementSource, TabMediaObserver, TabMediaState2, TabProgressElementSource } from "@/lib/browser-media";

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

// type MediaElementObserver = ElementGroupObserver<HTMLMediaElement, EventListener>;

// let mediaElementObserver: MediaElementObserver | null = null;
// let progressElementObserver: PlaybackPositionProgressElementObserver | null = null;

browser.runtime.onMessage.addListener(({ type }) => {
  // if (!mediaElementObserver || !progressElementObserver) {
  //   console.assert(false, "Missing observers");
  //   return;
  // }
  if (!mediaObserver) {
    console.debug('missed a browser runtime message:',
      BrowserMedia.ExtensionMessage[type]);
    return;
  }
  switch (type) {
  case BrowserMedia.ExtensionMessage.SendMediaUpdates:
    console.log('SendMediaUpdates');
    // mediaElementObserver.restart();
    // progressElementObserver.restart();
    mediaObserver.start();
    break;
  case BrowserMedia.ExtensionMessage.CancelMediaUpdates:
    console.log('CancelMediaUpdates');
    // mediaElementObserver.stop();
    // progressElementObserver.stop();
    mediaObserver.stop();
    break;
  }
});

// function onMediaUpdate(state: TabMediaState2) {
//   console.log('UPDATE', state);
//   // browser.runtime.sendMessage({
//   //   type: BrowserMedia.TabMessage.MediaChanged,
//   //   // TODO:
//   //   // - the page url needs to be part of the state
//   //   // - resource URLs need to be part of the state
//   //   // => we can then call this without args
//   //   data: null // state.toProto()
//   // });
// }

function init() {
  hookFutureAudioElements();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    init();

    // mediaElementObserver = new ElementGroupObserver(
    //   new TabMediaElementSource(),
    //   new EventListenerObservationStrategy(
    //     ['play', 'pause', 'timeupdate', 'durationchange']
    //   )
    // );

    // mediaElementObserver.addEventListener((event: Event) => {
    //   if (event.type === 'pause') {
    //     console.log('paused.', 'maybe a different element now? (deezer)');
    //   }

    //   // TODO Send media updates...
    //   console.log('media element changed',
    //   );
    // });

    // progressElementObserver = new PlaybackPositionProgressElementObserver(
    //   new TabProgressElementSource()
    // );

    // progressElementObserver.addEventListener((mutation: MutationRecord) => {

    //   // TODO Send media updates...
    //   console.log('playback position changed',
    //     progressElementObserver?.playbackPositionProgressElement?.value,
    //     progressElementObserver?.playbackPositionProgressElement?.min,
    //     progressElementObserver?.playbackPositionProgressElement?.max,
    //     progressElementObserver?.lastPlaybackPositionUpdate
    //   );
    // });

    mediaObserver = new TabMediaObserver();
    // mediaObserver.onMediaUpdate = onMediaUpdate;
  },
});
