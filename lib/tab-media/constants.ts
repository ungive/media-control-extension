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

  export const URL_MATCHES: {
    [key: string]: ResourceLinkPatterns
  } = {
    // FIXME other Amazon Music domains are missing
    // FIXME don't hardcode this here
    'de.amazon.music': {
      track: undefined,
      album: new RegExp('/albums/'),
      artist: new RegExp('/artists/')
    },
    'com.tidal.listen': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/')
    },
    'com.spotify.open': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/'),
      // track: undefined,
      // album: undefined,
      // artist: undefined
    },
    'com.youtube.music': {
      track: new RegExp('/watch'),
      album: new RegExp('/browse/'),
      artist: new RegExp('/channel/')
    },
    'com.deezer': {
      track: new RegExp('/track/'),
      album: new RegExp('/album/'),
      artist: new RegExp('/artist/')
    }
  };

  // The target precision is always milliseconds.
  // TODO Use generic precision enum type, not ProgressElementPrecision.
  export const PLAYBACK_POSITION_PRECISION = ProgressElementPrecision.Milliseconds;
}
