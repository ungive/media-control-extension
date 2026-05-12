import { isMediaElementPaused } from "../util/document";
import { Constants } from "./constants";
import { AriaProgressElementFactory, InputRangeProgressElementFactory, ProgressElement } from "./progress-element";

/**
 * Represents an arbitrary source for getting elements in the DOM.
 */
export interface IElementSource<E> {

  get(): E[];
}

/**
 * A filter for checking if a condition holds for a specific element.
 */
export interface IElementFilter<E> {

  test(element: E): boolean;
}

/**
 * An element filter for testing multiple filters on an element in order.
 */
export class MultiElementFilter<E> implements IElementFilter<E>{

  constructor(private filters: IElementFilter<E>[]) { }

  test(element: E): boolean {
    for (const filter of this.filters) {
      if (!filter.test(element)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Observes an element source to check if new elements are returned
 * or elements that have been returned previously have disappeared.
 */
export class ElementSourceObserver<E extends Object> {

  private listener: ((elements: E[]) => void) | null = null
  private intervalTimeout: NodeJS.Timeout | null = null
  private previousElements: E[] = []

  constructor(private source: IElementSource<E>) { }

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
 * Conditions to filter media elements by.
 */
export interface MediaElementFilterOptions {
  requireDuration: boolean;
  allowPaused: boolean;
}

/**
 * Type for filtering out media elements for specific conditions.
 */
export class MediaElementFilter implements IElementFilter<HTMLMediaElement> {

  constructor(private options: MediaElementFilterOptions = {
    requireDuration: true,
    allowPaused: true,
  }) { }

  test(element: HTMLMediaElement): boolean {
    if (!(element instanceof HTMLAudioElement) && !(element instanceof HTMLVideoElement)) {
      console.assert(false, "Unexpected media element type:", element.nodeName, element);
      return false;
    }
    if (this.options.requireDuration) {
      if (isNaN(element.duration) || element.duration <= 0) {
        return false;
      }
    }
    if (!this.options.allowPaused) {
      if (isMediaElementPaused(element)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Type for filtering out elements that match one or more query selectors.
 */
export class ExcludeElementFilter implements IElementFilter<Element> {

  constructor(private querySelectors: string[]) { }

  test(element: Element): boolean {
    if (element.parentNode === null) {
      console.assert(false, "Element does not have a parent node");
      return true;
    }
    for (const selector of this.querySelectors) {
      if (element.parentNode.querySelector(selector) === element) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Returns all media elements on the page.
 */
export class MediaElementSource implements IElementSource<HTMLMediaElement> {

  constructor(
    private filter: IElementFilter<HTMLMediaElement> = new MediaElementFilter(),
    private source: ParentNode = document
  ) { }

  get(): HTMLMediaElement[] {
    const elements: HTMLMediaElement[] = [];
    for (const audio of this.source.querySelectorAll('audio')) {
      if (audio instanceof HTMLAudioElement) {
        elements.push(audio);
      }
    }
    for (const video of this.source.querySelectorAll('video')) {
      if (video instanceof HTMLVideoElement) {
        elements.push(video);
      }
    }
    const filtered: HTMLMediaElement[] = [];
    for (const media of elements) {
      if (this.filter.test(media)) {
        filtered.push(media);
      }
    }
    return filtered;
  }
}
