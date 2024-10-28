import { Constants } from "../constants";
import { ProgressElement, ProgressElementPrecision } from "../progress-element";

export interface IElementSource<E> {
  get(): E[];
}

/**
 * Observes an element source to check if new elements are returned
 * or elements that have been returned previously have disappeared.
 */
export class ElementSourceObserver<E extends Object> {

  private listener: ((elements: E[]) => void) | null = null
  private intervalTimeout: NodeJS.Timeout | null = null
  private previousElements: E[] = []

  constructor(private source: IElementSource<E>) {}

  setListener(callback: (elements: E[]) => void) {
    this.listener = callback
  }

  start(currentElements: E[] = []) {
    const self = this;
    this.previousElements = currentElements;
    this.intervalTimeout = setInterval(this.#intervalCallback.bind(this), 1000);
    setTimeout(this.#intervalCallback.bind(this), 0);
  }

  stop() {
    if (this.intervalTimeout !== null) {
      clearInterval(this.intervalTimeout);
      this.intervalTimeout = null;
    }
    this.previousElements = [];
  }

  #intervalCallback() {
    if (this.listener === null)
      return;
    const elements = this.source.get();
    if (elements.length !== this.previousElements.length) {
      this.listener(elements);
      this.previousElements = elements;
      return;
    }
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i];
      const b = this.previousElements[i];
      if (a.valueOf() !== b.valueOf()) {
        this.listener(elements);
        this.previousElements = elements;
        return;
      }
    }
  }
}

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

  // get playbackPositionProgressElement(): ProgressElement | undefined {
  //   return this.currentPlaybackPositionProgressElement ?? undefined;
  // }

  // get lastPlaybackPositionUpdate(): number | undefined {
  //   return this.lastPlaybackPositionValueUpdate ?? undefined;
  // }

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
        // this.lastPlaybackPositionValueUpdate = nowTimestamp;
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
