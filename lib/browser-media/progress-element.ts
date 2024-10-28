export interface IProgressElement {
  min: number | null;
  max: number | null;
  value: number | null;
}

export enum ProgressElementPrecision {
  Seconds = 1,
  Milliseconds = 1000
}

export class ProgressElement implements IProgressElement {
  private _element: Element
  private _minAttribute: string
  private _maxAttribute: string
  private _valueAttribute: string

  private _valuePrecision: ProgressElementPrecision
  private _targetPrecision: ProgressElementPrecision

  constructor(
    element: Element,
    minAttribute: string,
    maxAttribute: string,
    valueAttribute: string,
    targetPrecision = ProgressElementPrecision.Milliseconds,
    valuePrecision = ProgressElementPrecision.Milliseconds
  ) {
    this._element = element;
    this._minAttribute = minAttribute;
    this._maxAttribute = maxAttribute;
    this._valueAttribute = valueAttribute;
    this._targetPrecision = targetPrecision;
    this._valuePrecision = valuePrecision;
  }

  get element(): Element { return this._element; }
  valueOf(): Element {
    return this._element;
  }

  get min(): number | null { return this.#getFloat(this._minAttribute); }
  get max(): number | null { return this.#getFloat(this._maxAttribute); }
  get value(): number | null { return this.#getFloat(this._valueAttribute); }

  get minAttribute(): string { return this._minAttribute; }
  get maxAttribute(): string { return this._maxAttribute; }
  get valueAttribute(): string { return this._valueAttribute; }

  get valuePrecision(): ProgressElementPrecision { return this._valuePrecision; }
  set valuePrecision(value: ProgressElementPrecision) { this._valuePrecision = value; }

  get targetPrecision(): ProgressElementPrecision { return this._targetPrecision; }
  set targetPrecision(value: ProgressElementPrecision) { this._targetPrecision = value; }

  get multiplier(): number { return this._targetPrecision / this._valuePrecision; }
  
  #getFloat(name: string): number | null {
    const value = this._element.getAttribute(name);
    return value ? parseFloat(value) * this.multiplier : null;
  }

  observeWith(mutationObserver: MutationObserver) {
    mutationObserver.observe(this._element, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        this._minAttribute,
        this._maxAttribute,
        this._valueAttribute
      ]
    });
  }
}

export class ProgressElementFactory {
  private baseSelector: string
  private minAttribute: string
  private maxAttribute: string
  private valueAttribute: string

  constructor(
    baseSelector: string,
    minAttribute: string,
    maxAttribute: string,
    valueAttribute: string
  ) {
    this.baseSelector = baseSelector;
    this.minAttribute = minAttribute;
    this.maxAttribute = maxAttribute;
    this.valueAttribute = valueAttribute;
  }

  queryAll(): ProgressElement[] {
    const progressElements: ProgressElement[] = [];
    const elements = document.querySelectorAll(this.baseSelector
      + `[${this.minAttribute}][${this.maxAttribute}][${this.valueAttribute}]`);
    for (const element of elements) {
      progressElements.push(new ProgressElement(
        element, this.minAttribute, this.maxAttribute, this.valueAttribute
      ));
    }
    return progressElements;
  }
}

export  class InputRangeProgressElementFactory extends ProgressElementFactory {
  constructor() {
    super('input[type="range"]', 'min', 'max', 'value');
  }
}

export class AriaProgressElementFactory extends ProgressElementFactory {
  constructor() {
    super('', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow');
  }
}
