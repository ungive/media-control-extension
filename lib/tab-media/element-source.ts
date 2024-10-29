import { Constants } from "./constants";
import { AriaProgressElementFactory, InputRangeProgressElementFactory, ProgressElement } from "./progress-element";

/**
 * Represents an arbitrary source for getting elements in the DOM.
 */
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
 * Observes media elements on the page.
 */
export class TabMediaElementSource implements IElementSource<HTMLMediaElement> {

  get(): HTMLMediaElement[] {
    // FIXME we are not considering playback rate here yet.
    const elements: HTMLMediaElement[] = [];
    for (const audio of document.querySelectorAll('audio')) {
      elements.push(audio);
    }
    for (const video of document.querySelectorAll('video')) {
      elements.push(video);
    }
    const result = [];
    for (const media of elements) {
      if (isNaN(media.duration) || media.duration <= 0)
        continue;
      result.push(media);
    }
    return result;
  }
}
