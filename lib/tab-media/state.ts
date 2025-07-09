import deepEqual from "deep-equal";
import { BrowserMedia } from "../proto";
import { ReverseDomain } from "../util/reverse-domain";
import { Constants } from "./constants";
import { PlaybackState } from "./playback-state";
import { ResourceType } from "./resource-links";

/**
 * A descriptor for where the current playback state has been obtained from,
 * since there can be multiple different sources,
 * depending on how the web player is implemented for a specific service.
 */
export enum PlaybackStateSource {
  /**
   * The playback state is read from a media element like <audio> or <video>.
   */
  MediaElement,
  /**
   * The playback state is read from a progress element,
   * with values using the unit milliseconds.
   */
  ProgressElementMilliseconds,
  /**
   * The playback state is read from a progress element,
   * with values using the unit seconds.
   */
  ProgressElementSeconds,
  /**
   * The playback state is estimated on a best-effort basis
   * because there is no reliable source available for this information.
   */
  Estimated
}

export class TabMediaPlaybackState extends PlaybackState {

  private _source: PlaybackStateSource

  constructor(
    source: PlaybackStateSource,
    position: number,
    duration: number | null,
    playing: boolean,
    positionTimestamp = Date.now()
  ) {
    super(position, duration, playing, positionTimestamp);
    this._source = source;
  }

  get source(): PlaybackStateSource { return this._source; }
}

export enum TabMediaStateChange {
  StartedPlaying,
  PlaybackStateChanged,
  TrackChanged,
  Nothing
}

export interface ITabMediaState {
  playbackState: TabMediaPlaybackState
  mediaMetadata: MediaMetadata | null
}

/**
 * Represents the current state of media playback in a browser tab.
 * If any of the fields have different values,
 * the media state is considered updated.
 */
export class TabMediaState implements ITabMediaState {

  readonly mediaMetadata: MediaMetadata | null
  readonly playbackState: TabMediaPlaybackState

  constructor(o: ITabMediaState) {
    // Make a deep copy of the metadata because if we keep a reference,
    // it might be updated in the meantime or cause other issues,
    // since objects of that type are owned by the browser runtime.
    this.mediaMetadata = o.mediaMetadata ? {
      title: o.mediaMetadata.title,
      artist: o.mediaMetadata.artist,
      album: o.mediaMetadata.album,
      artwork: o.mediaMetadata.artwork.map(e => {
        return {
          src: e.src,
          sizes: e.sizes,
          type: e.type
        }
      }),
    } : null
    this.playbackState = o.playbackState
  }

  /**
   * Compares the current state to a previous state
   * and determines what exactly has changed.
   *
   * @param previousState The previous state to compare to.
   * @returns A {@link TabMediaStateChange} value indicating what has changed.
   */
  determineChanges(previousState: TabMediaState | null | undefined): TabMediaStateChange {
    if (!previousState) {
      return TabMediaStateChange.StartedPlaying;
    }
    if (!deepEqual(previousState.mediaMetadata, this.mediaMetadata, {
      strict: true
    })) {
      return TabMediaStateChange.TrackChanged;
    }
    if (!previousState.playbackState.equals(this.playbackState, Math.min(
      Constants.EPSILONS_FOR_PLAYBACK_STATE_SOURCE[this.playbackState.source],
      Constants.EPSILONS_FOR_PLAYBACK_STATE_SOURCE[previousState.playbackState.source]
    ))) {
      return TabMediaStateChange.PlaybackStateChanged;
    }
    return TabMediaStateChange.Nothing;
  }

  /**
   * Serializes the current media state into its respective protobuf type.
   */
  serialize(
    url: URL,
    faviconUrl: URL | null,
    resourceLinks: Map<ResourceType, Map<string, string>>
  ): BrowserMedia.MediaState {
    return {
      source: {
        reverseDomain: ReverseDomain.forUrl(url),
        siteUrl: url.href,
        faviconUrl: faviconUrl?.href
      },
      metadata: this.mediaMetadata ? {
        title: this.mediaMetadata.title,
        artist: this.mediaMetadata.artist.length > 0 ? this.mediaMetadata.artist : undefined,
        album: this.mediaMetadata.album.length > 0 ? this.mediaMetadata.album : undefined,
        duration: this.playbackState.duration ? this.playbackState.duration / 1000 : undefined
      } : (document.title.length > 0 ? {
        title: document.title
      } : undefined),
      playbackState: {
        position: this.playbackState.position / 1000,
        positionTimestamp: new Date(this.playbackState.positionTimestamp),
        playing: this.playbackState.playing
      },
      resourceLinks: {
        trackUrl: resourceLinks.has(ResourceType.Track)
          ? Object.fromEntries(resourceLinks.get(ResourceType.Track)!.entries())
          : {},
        albumUrl: resourceLinks.has(ResourceType.Album)
          ? Object.fromEntries(resourceLinks.get(ResourceType.Album)!.entries())
          : {},
        artistUrl: resourceLinks.has(ResourceType.Artist)
          ? Object.fromEntries(resourceLinks.get(ResourceType.Artist)!.entries())
          : {},
      },
      images: this.mediaMetadata?.artwork.map((a): BrowserMedia.MediaState_Image => {
        const sizes = a.sizes?.split('x');
        // TODO extract raw data from src if it's a data URL? or simply ignore
        // this case and handle it somewhere else when the need arises?
        return {
          url: a.src,
          mimeType: a.type ?? undefined,
          width: (sizes && sizes?.length >= 1 ? parseInt(sizes[0]) : undefined) || undefined,
          height: (sizes && sizes?.length >= 2 ? parseInt(sizes[1]) : undefined) || undefined
        };
      }) ?? []
    };
  }
}
