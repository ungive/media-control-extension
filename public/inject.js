// Appends any audio elements that are being played or paused to the DOM
// so that they can be found and used by the content script.
// This hook needs to be executed within the web page, not a content script,
// otherwise overwritin the Audio prototype has no effect.

(function hookFutureAudioElements() {
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
})();
