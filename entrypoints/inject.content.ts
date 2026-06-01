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
