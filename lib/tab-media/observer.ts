import { TabMessage } from "@/lib/messages";
import { ReverseDomain } from "@/lib/util/reverse-domain";
import { Constants } from "./constants";
import { ElementSourceObserver, IElementSource, TabMediaElementSource, TabProgressElementSource } from "./element-source";
import { ProgressElement, ProgressElementPrecision } from "./progress-element";
import { findBestMatchingResourceLinks, ResourceLinkPatterns } from "./resource-links";
import { isMediaElementPaused, PlaybackStateSource, TabMediaPlaybackState, TabMediaState, TabMediaStateChange } from "./state";

/**
 * Represents a strategy for observing elements in the DOM.
 */
export interface IObservationStrategy<E, C extends CallableFunction> {

  addListeners(element: E, handler: C): void
  removeListeners(): void
}

export type ElementEventCallback<E> = (element: E, event: Event) => void;

export class EventListenerObservationStrategy<E extends EventTarget>
  implements IObservationStrategy<E, ElementEventCallback<E>> {

  private readonly eventNames: string[]

  private listeners: {
    element: E
    callback: EventListener
  }[] = []

  constructor(eventNames: string[]) {
    if (eventNames.length <= 0) {
      throw new Error('must have at least one event to listen for');
    }
    this.eventNames = [...eventNames];
  }

  addListeners(element: E, handler: ElementEventCallback<E>): void {
    for (const eventName of this.eventNames) {
      const callback = (e: Event) => handler(element, e);
      element.addEventListener(eventName, callback);
      this.listeners.push({ element, callback });
    }
  }

  removeListeners(): void {
    for (const listener of this.listeners) {
      for (const eventName of this.eventNames) {
        listener.element.removeEventListener(eventName, listener.callback);
      }
    }
    this.listeners = [];
  }
}

export interface MutationObserverObserveArgs {
  target: Node
  mutationObserverInit: MutationObserverInit | undefined
}

export type MutationObserverObserveArgsFactory<E>
  = (element: E) => MutationObserverObserveArgs

export type ElementMutationsCallback<E> =
  (element: E, mutations: MutationRecord[]) => void;

export class NodeMutationObservationStrategy<E>
  implements IObservationStrategy<E, ElementMutationsCallback<E>> {

  private readonly mutationObserver: MutationObserver
  private readonly mutationObserveArgsFactory: MutationObserverObserveArgsFactory<E>

  private listeners: {
    element: E
    callback: ElementMutationsCallback<E>
  }[] = []

  constructor(mutationObserveArgsFactory: MutationObserverObserveArgsFactory<E>) {
    this.mutationObserver = new MutationObserver(this.#mutationCallback.bind(this));
    this.mutationObserveArgsFactory = mutationObserveArgsFactory;
  }

  #mutationCallback(mutations: MutationRecord[], observer: MutationObserver) {
    for (const listener of this.listeners) {
      listener.callback(listener.element, mutations);
    }
  }

  addListeners(element: E, callback: ElementMutationsCallback<E>): void {
    this.listeners.push({ element, callback });
    const args = this.mutationObserveArgsFactory(element);
    this.mutationObserver.observe(
      args.target,
      args.mutationObserverInit
    );
  }

  removeListeners(): void {
    this.mutationObserver.disconnect();
    this.listeners = [];
  }
}

export interface IPausableObserver<C extends CallableFunction> {
  start(): boolean
  stop(): boolean
  restart(): boolean
  addEventListener(callback: C): void
}

/**
 * Observes a set of events on an element from an arbitrary source,
 * with the option to restart observation if it is suspected
 * that the source might supply a different element at another point in time.
 */
export class ElementGroupObserver<E extends Object, C extends CallableFunction>
  implements IPausableObserver<C> {

  private readonly elementSource: IElementSource<E>
  private readonly elementSourceObserver: ElementSourceObserver<E>
  private readonly observationStrategy: IObservationStrategy<E, C>
  private readonly eventCallbacks: C[] = []

  private currentElements: E[] = []
  private pendingEventCallbacks: C[] = []

  constructor(
    elementSource: typeof this.elementSource,
    observationStrategy: typeof this.observationStrategy
  ) {
    this.elementSource = elementSource;
    this.observationStrategy = observationStrategy;
    this.elementSourceObserver = new ElementSourceObserver(elementSource);
    this.elementSourceObserver.setListener(this.#onElementsChanged.bind(this));
  }

  addEventListener(callback: C) {
    this.eventCallbacks.push(callback);
    if (this.currentElements.length > 0) {
      for (const element of this.currentElements) {
        this.observationStrategy.addListeners(element, callback);
      }
    }
    else {
      this.pendingEventCallbacks.push(callback);
    }
  }

  start(): boolean {
    let elements = this.elementSource.get();
    this.elementSourceObserver.start(elements);
    return this.#internalStart(elements);
  }

  stop(): boolean {
    this.elementSourceObserver.stop();
    return this.#internalStop();
  }

  restart(): boolean {
    this.stop();
    return this.start();
  }

  #onElementsChanged(elements: E[]) {
    if (elements.length === 0) {
      for (const callback of this.eventCallbacks) {
        callback(undefined);
      }
    }
    this.restart();
  }

  #internalStart(elements: E[]): boolean {
    if (this.currentElements.length > 0) {
      return true;
    }
    if (elements.length === 0) {
      return false;
    }
    this.currentElements = [...elements];
    const callbacks = this.pendingEventCallbacks;
    this.pendingEventCallbacks = [];
    for (const element of this.currentElements) {
      for (const callback of callbacks) {
        this.observationStrategy.addListeners(element, callback);
      }
    }
    return true;
  }

  #internalStop(): boolean {
    if (this.currentElements.length === 0) {
      return false;
    }
    this.observationStrategy.removeListeners();
    this.currentElements = [];
    this.pendingEventCallbacks = [...this.eventCallbacks];
    return true;
  }
}

interface ProgressElementState {
  progressElement: ProgressElement
  lastValue: number | null
  lastValueTimestamp: number | null
}

export type ElementMutationCallback<E> =
  (element: E, mutation: MutationRecord) => void;

export class PlaybackPositionProgressElementObserver
  implements IPausableObserver<ElementMutationCallback<ProgressElement>> {

  private progressElementState: Map<Element, ProgressElementState> = new Map();
  private currentPlaybackPositionProgressElement: ProgressElement | null = null;
  // private lastPlaybackPositionValueUpdate: number | null = null;

  private elementGroupObserver: ElementGroupObserver<ProgressElement, ElementMutationsCallback<ProgressElement>>
  private eventCallbacks: ElementMutationCallback<ProgressElement>[] = []

  constructor(
    elementSource: IElementSource<ProgressElement>
  ) {
    this.elementGroupObserver = new ElementGroupObserver(
      this.#wrapElementSource(elementSource),
      new NodeMutationObservationStrategy(
        PlaybackPositionProgressElementObserver.#createMutationObserveArgs));
    this.elementGroupObserver.addEventListener(this.#onMutated.bind(this));
  }

  start(): boolean { return this.elementGroupObserver.start(); }
  stop(): boolean { return this.elementGroupObserver.stop(); }
  restart(): boolean { return this.elementGroupObserver.restart(); }

  addEventListener(callback: ElementMutationCallback<ProgressElement>): void {
    this.eventCallbacks.push(callback);
  }

  #onMutated(element: ProgressElement, mutations: MutationRecord[]) {

    // FIXME what if the progress element is removed or replaced?
    // in that case we would rely on an invalid element the whole time.

    const nowTimestamp = Date.now();
    for (const mutation of mutations) {
      if (!mutation.attributeName) {
        continue;
      }
      if (!(mutation.target instanceof HTMLElement)) {
        continue;
      }
      if (!document.contains(mutation.target)) {
        continue;
      }
      const state = this.progressElementState.get(mutation.target);
      if (!state) {
        continue;
      }
      if (mutation.target !== state.progressElement.element) {
        console.assert(false, "mutated element is not the progress element");
        continue;
      }

      // When the playback position progress element has already been found
      // we simply trigger a media update when an attribute changed.
      // We break the loop, since we don't need to send updates more than once
      // for the current set of mutations.
      if (this.currentPlaybackPositionProgressElement) {
        if (this.currentPlaybackPositionProgressElement.element === mutation.target) {
          if (mutation.attributeName == state.progressElement.valueAttribute) {
            // this.lastPlaybackPositionValueUpdate = nowTimestamp;
            // FIXME Shouldn't we only call the callback if the attributeName changed?
          }
          for (const callback of this.eventCallbacks) {
            callback(this.currentPlaybackPositionProgressElement, mutation);
          }
        }
        continue;
      }

      if (mutation.attributeName !== state.progressElement.valueAttribute) {
        continue;
      }
      const valueString = mutation.target.getAttribute(mutation.attributeName);
      if (valueString === null) {
        continue;
      }
      const realNewValue = parseFloat(valueString);
      if (state.lastValue === null || state.lastValueTimestamp === null) {
        state.lastValue = realNewValue;
        state.lastValueTimestamp = nowTimestamp;
        continue;
      }
      let newValue = realNewValue;
      let lastValue = state.lastValue;
      if (newValue <= lastValue) {
        // The new value must be larger than the old value;
        state.lastValue = realNewValue;
        state.lastValueTimestamp = nowTimestamp;
        continue;
      }

      const timeDeltaMillis = nowTimestamp - state.lastValueTimestamp;
      const timeDeltaSecs = timeDeltaMillis / 1000.0;
      let positionDelta = newValue - lastValue;
      let isMillis = true;
      let epsilon = Constants.PROGRESS_MILLIS_EPSILON;
      if (positionDelta < timeDeltaSecs * 2) {
        isMillis = false;
      }
      if (!isMillis) {
        state.progressElement.valuePrecision = ProgressElementPrecision.Seconds;
        newValue *= state.progressElement.multiplier;
        lastValue *= state.progressElement.multiplier;
        positionDelta = newValue - lastValue;
        epsilon = Constants.PROGRESS_SECS_EPSILON;
      }

      const difference = Math.abs(timeDeltaMillis - positionDelta);
      if (difference <= epsilon) {
        this.currentPlaybackPositionProgressElement = state.progressElement;
        state.lastValue = null;
        state.lastValueTimestamp = null;
        continue;
      }

      state.lastValue = realNewValue;
      state.lastValueTimestamp = nowTimestamp;
    }
  }

  #wrapElementSource(
    source: IElementSource<ProgressElement>
  ): IElementSource<ProgressElement> {
    const self = this;
    return {
      get() {
        const progressElements = source.get();
        const nowTimestamp = Date.now();
        for (const progressElement of progressElements) {
          self.progressElementState.set(progressElement.element, {
            progressElement: progressElement,
            lastValue: progressElement.value,
            lastValueTimestamp: nowTimestamp
          });
        }
        return progressElements;
      }
    };
  }

  static #createMutationObserveArgs(element: ProgressElement) {
    return {
      target: element.element,
      mutationObserverInit: {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: [
          element.minAttribute,
          element.maxAttribute,
          element.valueAttribute
        ]
      }
    };
  }
}

enum TabMediaObserverState {
  Idle,
  Observing,
}

export type MediaElementObserver = ElementGroupObserver<HTMLMediaElement, ElementEventCallback<HTMLMediaElement>>;

export class TabMediaObserver {

  private observerState: TabMediaObserverState = TabMediaObserverState.Idle

  private mediaElementObserver: MediaElementObserver;
  private progressElementObserver: PlaybackPositionProgressElementObserver;
  private currentMediaElement: HTMLMediaElement | null = null;
  private currentProgressElement: ProgressElement | null = null;
  private estimatedTrackStartTime: number | null = null
  private previousMediaState: TabMediaState | null = null
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
    if (this.observerState == TabMediaObserverState.Observing)
      return;
    this.observerState = TabMediaObserverState.Observing;
    this.mediaElementObserver.restart();
    this.progressElementObserver.restart();
  }

  stop(): void {
    if (this.observerState == TabMediaObserverState.Idle)
      return;
    this.mediaElementObserver.stop();
    this.progressElementObserver.stop();
    this.currentMediaElement = null;
    this.currentProgressElement = null;
    this.observerState = TabMediaObserverState.Idle;
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
          state = new TabMediaState({
            // url: state.url,
            mediaMetadata: state.mediaMetadata,
            playbackState: this.#estimatedPlaybackPosition(state.playbackState.playing),
            // resourceLinks: state.resourceLinks,
          });
        }
    }
    const url = new URL(window.location.href);
    const reverseDomain = ReverseDomain.forUrl(url);
    browser.runtime.sendMessage({
      type: TabMessage.MediaChanged,
      data: state.serialize(
        url,
        state.mediaMetadata
          ? findBestMatchingResourceLinks(
            state.mediaMetadata,
            reverseDomain in Constants.URL_MATCHES
              ? Constants.URL_MATCHES[reverseDomain]
              : ({} as ResourceLinkPatterns)
          )
          : new Map()
      ),
    });
    this.previousMediaState = state;
  }

  #currentMediaState(): TabMediaState {
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

    const url = new URL(window.location.href);
    const reverseDomain = ReverseDomain.forUrl(url);
    const metadata = navigator.mediaSession.metadata;
    return new TabMediaState({
      // url: url,
      mediaMetadata: metadata,
      playbackState: playbackState,
      // resourceLinks: metadata
      //   ? findBestMatchingResourceLinks(
      //     metadata,
      //     reverseDomain in Constants.URL_MATCHES
      //       ? Constants.URL_MATCHES[reverseDomain]
      //       : ({} as ResourceLinkPatterns)
      //   )
      //   : new Map()
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
