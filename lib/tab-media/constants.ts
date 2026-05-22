import { ProgressElementPrecision } from "./progress-element";
import { ResourceLinkPatterns } from "./resource-links";
import { PlaybackStateSource } from "./state";

export namespace Constants {

  export const UPDATE_INTERVAL = 1000;
  export const PROGRESS_MILLIS_EPSILON = 25;
  export const PROGRESS_SECS_EPSILON = 250;

  export const EPSILONS_FOR_PLAYBACK_STATE_SOURCE = {
    [PlaybackStateSource.MediaElement]: 100,
    [PlaybackStateSource.ProgressElementMilliseconds]: 250,
    [PlaybackStateSource.ProgressElementSeconds]: 1000,
    [PlaybackStateSource.Estimated]: 250,
  };

  // The target precision is always milliseconds.
  // TODO Use generic precision enum type, not ProgressElementPrecision.
  export const PLAYBACK_POSITION_PRECISION = ProgressElementPrecision.Milliseconds;

  // FIXME Hardcode constants and per-site configuration in a separate place.

  export const URL_MATCHES: {
    [key: string]: ResourceLinkPatterns
  } = {
    // FIXME The patterns aren't anchored at the root of the URL.
    // FIXME Other Amazon Music domains are missing.
    'de.amazon.music': {
      track: undefined,
      album: new RegExp('/albums/'),
      artist: new RegExp('/artists/'),
    },
    'com.apple.music': {
      track: new RegExp('(?:/[^\\/]+)?/song/'),
      album: new RegExp('(?:/[^\\/]+)?/album/'),
      artist: new RegExp('(?:/[^\\/]+)?/artist/'),
    },
    'com.apple.music.classical': {
      track: new RegExp('(?:/[^\\/]+)?/song/'),
      album: new RegExp('(?:/[^\\/]+)?/album/'),
      artist: new RegExp('(?:/[^\\/]+)?/artist/'),
    },
    'com.tidal': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/'),
    },
    'com.tidal.stage': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/'),
    },
    'com.spotify.open': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/'),
    },
    'com.youtube.music': {
      track: new RegExp('/watch'),
      album: new RegExp('/browse/'),
      artist: new RegExp('/channel/'),
    },
    'com.youtube': {
      track: new RegExp('/watch'),
      album: undefined,
      artist: new RegExp('(/channel/|/@[^\\/]+$)'),
    },
    'com.deezer': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/'),
    },
    'com.bandcamp': {
      track: undefined,
      album: new RegExp('/album/'),
      artist: new RegExp('[^\\.]+\\.[^\\.]+\\.[^\\.\\/]+\\/?(\\?.+)?$'),
    },
    'com.soundcloud': {
      track: new RegExp('/[^\\/]+/[^\\/]+(\\?.+)?$'),
      album: new RegExp('/[^\\/]+/sets/'),
      artist: new RegExp('/[^\\/]+(\\?.+)?$'),
    }
  };

  // Media elements to ignore that mess with actually playing media.
  export const IGNORE_MEDIA_ELEMENT_SELECTORS: {
    [key: string]: string[]
  } = {
    // FIXME This can at most include the immediate parent due to how we detect
    // if a selector matches a specific element.
    'com.tidal': [
      // Animated album covers.
      'video[poster^="https://resources.tidal.com"]'
    ],
    'com.spotify.open': [
      // Canvas.
      'div[class^="canvas"] > video[src*="https://open.spotify.com"]'
    ]
  };
}
