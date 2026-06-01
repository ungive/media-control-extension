// Appends any audio elements that are being played or paused to the DOM so
// that they can be found and used by the isolated content script. This hook
// needs to be executed directly within the web page, i.e. in the main world,
// otherwise overwriting the Audio prototype has no effect.

// An example website that needs this injection is https://soundcloud.com.
// Without it media wouldn't be detected immediately when it starts playing.

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

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: "document_start",
  world: "MAIN",
  main() {
    hookFutureAudioElements();
  },
});
