import { ReverseDomain } from "@/lib/util";
import { Constants } from "../constants"
import {
  AriaProgressElementFactory,
  InputRangeProgressElementFactory,
  ProgressElement,
  ProgressElementPrecision
} from "../progress-element"
import { PlaybackStateSource, TabMediaPlaybackState, TabMediaState2, TabMediaStateChange } from "../state"
import { ElementEventCallback, ElementGroupObserver, ElementSourceObserver, EventListenerObservationStrategy, IElementSource, PlaybackPositionProgressElementObserver } from "./media-element"
import { BrowserMedia, findBestMatchingResourceLinks, ResourceLinkPatterns } from "..";

/**
 * Observes progress elements on the page
 * and forwards any changes and mutations to the one element
 * whose value advances 1 unit per passed time unit,
 * which should help in tracking playback progress and changes of tab media.
 */
export class TabProgressElementSource
  implements IElementSource<ProgressElement> {

  get(): ProgressElement[] {
    const progressElements = [
      ...new InputRangeProgressElementFactory().queryAll(),
      ...new AriaProgressElementFactory().queryAll()
    ];
    const encountered: Set<Element> = new Set();
    const filteredProgressElements: ProgressElement[] = [];
    for (const progressElement of progressElements) {
      if (encountered.has(progressElement.element)) {
        continue;
      }
      progressElement.targetPrecision = Constants.PLAYBACK_POSITION_PRECISION;
      filteredProgressElements.push(progressElement);
      encountered.add(progressElement.element);
    }
    return filteredProgressElements;
  }
}

/**
 * Checks whether a media element is considered paused.
 * 
 * @param element The media element.
 * @returns Whether the media element is considered paused.
 */
function isMediaElementPaused(element: HTMLMediaElement): boolean {
  // Muted media is considered paused for now,
  // as the background script detects playing media through "audible" tabs.
  return element.paused || element.muted;
}

/**
 * Observes media elements on the page.
 */
export class TabMediaElementSource implements IElementSource<HTMLMediaElement> {

  get(): HTMLMediaElement[] {
    // NOTE we are not considering playback rate here yet.
    // NOTE we are also returning the first element that matches.
    // ideally only one element should be playing, right?
    const elements: HTMLMediaElement[] = [];
    for (const audio of document.querySelectorAll('audio')) {
      elements.push(audio);
    }
    for (const video of document.querySelectorAll('video')) {
      elements.push(video);
    }
    for (const media of elements) {
      if (isMediaElementPaused(media)
        || isNaN(media.duration) || media.duration <= 0) {
        // Skip any media that is not playing, muted or has no duration,
        // since we are trying to find currently playing media.
        continue;
      }
      return [media];
    }
    return [];
  }
}

enum ObserverState {
  Idle,
  Observing,
}

export type MediaElementObserver = ElementGroupObserver<HTMLMediaElement, ElementEventCallback<HTMLMediaElement>>;

export class TabMediaObserver {

  private observerState: ObserverState = ObserverState.Idle

  private mediaElementObserver: MediaElementObserver;
  private progressElementObserver: PlaybackPositionProgressElementObserver;
  private currentMediaElement: HTMLMediaElement | null = null;
  private currentProgressElement: ProgressElement | null = null;
  private estimatedTrackStartTime: number | null = null
  private previousMediaState: TabMediaState2 | null = null
  // TODO set the interval to check every second for undetected changes
  private updateInterval: NodeJS.Timeout | null = null

  constructor() {
    this.mediaElementObserver = new ElementGroupObserver(
      new TabMediaElementSource(),
      new EventListenerObservationStrategy(
        ['play', 'pause', 'timeupdate', 'durationchange']
      )
    );
    this.progressElementObserver = new PlaybackPositionProgressElementObserver(
      new TabProgressElementSource()
    );
    this.mediaElementObserver.addEventListener(this.#onMediaElementUpdated.bind(this))
    this.progressElementObserver.addEventListener(this.#onProgressElementUpdated.bind(this))
  }

  // onMediaUpdate: (state: TabMediaState2) => void = () => {}

  start(): void {
    if (this.observerState == ObserverState.Observing)
      return;
    this.observerState = ObserverState.Observing;
    this.mediaElementObserver.restart();
    this.progressElementObserver.restart();
  }

  stop(): void {
    if (this.observerState == ObserverState.Idle)
      return;
    this.mediaElementObserver.stop();
    this.progressElementObserver.stop();
    this.currentMediaElement = null;
    this.currentProgressElement = null;
    this.observerState = ObserverState.Idle;
  }

  #onMediaElementUpdated(element: HTMLMediaElement) {
    this.currentMediaElement = element;
    this.#handleUpdate();
  }

  #onProgressElementUpdated(element: ProgressElement) {
    this.currentProgressElement = element;
    this.#handleUpdate();
  }

  #handleUpdate() {
    let state = this.#currentMediaState();
    const stateChange = state.determineChanges(this.previousMediaState);
    if (stateChange === TabMediaStateChange.Nothing) {
      return;
    }
    switch (stateChange) {
    case TabMediaStateChange.StartedPlaying:
    case TabMediaStateChange.TrackChanged:
      // FIXME not implemented yet so we catch bugs
      // this.estimatedTrackStartTime = Date.now();
      if (state?.playbackState.source === PlaybackStateSource.Estimated) {
        state = TabMediaState2.from({
          mediaMetadata: state.mediaMetadata,
          playbackState: this.#estimatedPlaybackPosition(state.playbackState.playing)
        });
      }
    }
    const url = new URL(window.location.href);
    const reverseDomain = ReverseDomain.forUrl(url);
    browser.runtime.sendMessage({
      type: BrowserMedia.TabMessage.MediaChanged,
      data: state.toProto(
        url,
        state.mediaMetadata 
          ? findBestMatchingResourceLinks(
            state.mediaMetadata,
            reverseDomain in Constants.URL_MATCHES
              ? Constants.URL_MATCHES[reverseDomain]
              : ({} as ResourceLinkPatterns)
          )
          : new Map())
    });
    this.previousMediaState = state;
  }

  #currentMediaState(): TabMediaState2 {
    const isPlaying = navigator.mediaSession.playbackState !== "paused"
      && (navigator.mediaSession.playbackState === "playing"
        || !this.currentMediaElement
        || !isMediaElementPaused(this.currentMediaElement));

    let playbackState: TabMediaPlaybackState | null = null;
    if (this.currentMediaElement) {
      playbackState = new TabMediaPlaybackState(
        PlaybackStateSource.MediaElement,
        Math.floor(this.currentMediaElement.currentTime * 1000),
        Math.floor(this.currentMediaElement.duration * 1000),
        isPlaying,
        Date.now()
      );
    }
    else if (this.currentProgressElement !== null
      && this.currentProgressElement.value !== null
      && this.currentProgressElement.max !== null
    ) {
      let playbackStateSource: PlaybackStateSource | null = null;
      switch (this.currentProgressElement.valuePrecision) {
      case ProgressElementPrecision.Milliseconds:
        playbackStateSource = PlaybackStateSource.ProgressElementMilliseconds
        break;
      case ProgressElementPrecision.Seconds:
        playbackStateSource = PlaybackStateSource.ProgressElementSeconds
        break;
      default:
        console.assert(false, "invalid progress element precision");
        playbackStateSource = PlaybackStateSource.Estimated;
        break;
      }
      playbackState = new TabMediaPlaybackState(
        playbackStateSource,
        Math.floor(this.currentProgressElement.value),
        Math.floor(this.currentProgressElement.max),
        isPlaying,
        Date.now()
      );
    }
    else {
      playbackState = this.#estimatedPlaybackPosition(isPlaying);
    }

    const metadata = navigator.mediaSession.metadata;
    return TabMediaState2.from({
      // Make a deep copy of the metadata object, because if we keep a reference,
      // it might be updated in the meantime or cause other issues.
      mediaMetadata: metadata ? {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        artwork: metadata.artwork.map(e => {
          return {
            src: e.src,
            sizes: e.sizes,
            type: e.type
          }
        }),
      } : null,
      playbackState
    });
  }

  // TODO implement this properly
  #estimatedPlaybackPosition(isPlaying: boolean): TabMediaPlaybackState {
    if (this.estimatedTrackStartTime === null) {
      this.estimatedTrackStartTime = Date.now();
    }
    const now = Date.now();
    const startTime = this.estimatedTrackStartTime;
    const position = now - startTime;
    return new TabMediaPlaybackState(
      PlaybackStateSource.Estimated,
      position, null, isPlaying, now
    );
  }
}
