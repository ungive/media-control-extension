import { Media } from "@/lib/media";
import { Constants, Proto, ResourceType } from ".";
import { ReverseDomain } from "../util";
import deepEqual from "deep-equal";

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

export class TabMediaPlaybackState extends Media.PlaybackState {

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

export interface ITabMediaState {
  playbackState: TabMediaPlaybackState
  mediaMetadata: MediaMetadata | null
}

export enum TabMediaStateChange {
  StartedPlaying,
  PlaybackStateChanged,
  TrackChanged,
  Nothing
}

/**
 * Represents the current state of media playback in a browser tab.
 * If any of the fields have different values,
 * the media state is considered updated.
 */
export class TabMediaState2 implements ITabMediaState {

  constructor(
    private _mediaMetadata: MediaMetadata | null,
    private _playbackState: TabMediaPlaybackState
  ) {}

  static from(o: ITabMediaState): TabMediaState2 {
    return new TabMediaState2(o.mediaMetadata, o.playbackState);
  }

  get mediaMetadata(): MediaMetadata | null { return this._mediaMetadata; }
  get playbackState(): TabMediaPlaybackState { return this._playbackState; }

  /**
   * Compares the current state to a previous state
   * and determines what exactly has changed.
   * 
   * @param previousState The previous state to compare to.
   * @returns A {@link TabMediaStateChange} value indicating what has changed.
   */
  determineChanges(previousState: TabMediaState2 | null | undefined): TabMediaStateChange {
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

  // TODO: resource links should be made part of TabMediaState
  // and then cached by the controller/observer for reusing.
  // also the URL/hostname can be made part of the media state,
  // which would make toProto() a method without any parameters.
  /**
   * Serializes the current media state into its respective protobuf type.
   * 
   * @param url 
   * @param resourceLinks 
   * @returns 
   */
  toProto(
    url: URL,
    resourceLinks: Map<ResourceType, string>
  ): Proto.MediaState {
    console.log(this.playbackState.positionTimestamp);
    console.log(new Date(this.playbackState.positionTimestamp));
    return {
      source: {
        reverseDomain: ReverseDomain.forUrl(url),
        url: url.href
      },
      metadata: this.mediaMetadata ? {
        title: this.mediaMetadata.title,
        artist: this.mediaMetadata.artist.length > 0 ? this.mediaMetadata.artist : undefined,
        album: this.mediaMetadata.album.length > 0 ? this.mediaMetadata.album : undefined,
        duration: this.playbackState.duration ? this.playbackState.duration / 1000 : undefined
      } : undefined,
      playbackState: {
        position: this.playbackState.position / 1000,
        positionTimestamp: new Date(this.playbackState.positionTimestamp),
        playing: this.playbackState.playing
      },
      resourceLinks: {
        trackUrl: resourceLinks.get(ResourceType.Track) ?? undefined,
        albumUrl: resourceLinks.get(ResourceType.Album) ?? undefined,
        artistUrl: resourceLinks.get(ResourceType.Artist) ?? undefined
      },
      images: this.mediaMetadata?.artwork.map((a): Proto.MediaState_Image => {
        const sizes = a.sizes?.split('x');
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
