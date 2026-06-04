// Overrides the Audio class constructor so that any newly created Audio element
// on the page is immediately appended to the document body. This is necessary
// on pages that autoplay audio without calling Audio.play() first. An example
// website where this is the case is https://deezer.com.
function installAudioConstructorHook() {
  const OriginalAudio = window.Audio;
  window.Audio = function (...args: ConstructorParameters<typeof Audio>) {
    const audio = new OriginalAudio(...args);
    // console.log('CTOR', audio);
    document.body.append(audio);
    return audio;
  } as unknown as typeof Audio;
  window.Audio.prototype = OriginalAudio.prototype;
}

function installPrototypeMethodHook(prototype: any, method: string) {
  const original = prototype[method];
  prototype[method] = function () {
    // console.log('HOOK', prototype, method, document.contains(this));
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

function installMediaPlaybackHooks() {
  installAudioConstructorHook();
  installMediaElementPrototypeMethodHooks();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: "document_start",
  // The injection code needs to be executed directly within the web page, i.e.
  // in the main world, otherwise the changes are not visible to the page code.
  world: "MAIN",
  main() {
    installMediaPlaybackHooks();
  },
});
