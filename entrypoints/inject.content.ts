import { ActionSeekToPayload, MediaSessionMessage, WindowMessage, WindowResponseMessage } from "@/lib/messages";

// Overrides the Audio class constructor so that any newly created Audio element
// on the page is immediately appended to the document body. This is necessary
// on pages that autoplay audio without calling Audio.play() first. An example
// website where this is the case is https://deezer.com.
function installAudioConstructorHook() {
  const OriginalAudio = window.Audio;
  window.Audio = function (...args: ConstructorParameters<typeof Audio>) {
    const audio = new OriginalAudio(...args);
    // console.log('[audio constructor]', audio);
    document.body.append(audio);
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
    if (!document.contains(this)) {
      document.body.append(this);
    }
    return result
  };
}

// Appends any audio elements that are being played or paused to the document
// body so that they can be found and used by the isolated content script. An
// example website that needs this injection is https://soundcloud.com, without
// it media wouldn't be detected immediately when it starts playing.
function installMediaElementPrototypeMethodHooks() {
  ['play', 'pause'].forEach(method => {
    // This includes each of HTMLVideoElement and HTMLAudioElement.
    installPrototypeMethodHook(HTMLMediaElement.prototype, method);
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
