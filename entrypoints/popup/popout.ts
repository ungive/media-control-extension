import { PopoutMessage } from "@/lib/messages"

const popupParams = new URLSearchParams(window.location.search)
const isPopoutWindow = !!popupParams.get('popout')

export function isPopout(): boolean {
  return isPopoutWindow
}

let lastRootElementSize: Dimensions | undefined

let resizeDebounceDelayedTimeout: number | undefined
let resizeDebounceDelay: number = 1000 / 60

interface Dimensions {
  width: number
  height: number
}

function areDimensionsEqual(
  a: Dimensions | undefined,
  b: Dimensions | undefined
): boolean {
  return a !== undefined && b !== undefined &&
    Math.ceil(a.width) === Math.ceil(b.width) &&
    Math.ceil(a.height) === Math.ceil(b.height)
}

function getRootElement(): Element | undefined {
  return document.querySelector('#root') || undefined
}

function getRootElementSize(): {
  width: number
  height: number
} {
  const rootElement = getRootElement()
  return {
    width: rootElement?.scrollWidth || 0,
    height: rootElement?.scrollHeight || 0
  }
}

function reportWindowSize() {
  const rootElement = getRootElement()
  if (!rootElement) {
    console.warn('Missing root element')
    return
  }
  const xOffset = Math.max(0, window.outerWidth - window.innerWidth)
  const yOffset = Math.max(0, window.outerHeight - window.innerHeight)
  const width = rootElement.scrollWidth + xOffset
  const height = rootElement.scrollHeight + yOffset
  if (width !== window.outerWidth || height !== window.outerHeight) {
    browser.runtime.sendMessage({
      type: PopoutMessage.WindowSize,
      payload: { width, height }
    })
  }
}

function reportWindowSizeDebouncedDelayed() {
  if (resizeDebounceDelayedTimeout) {
    clearTimeout(resizeDebounceDelayedTimeout)
    resizeDebounceDelayedTimeout = undefined
  }
  resizeDebounceDelayedTimeout = window.setTimeout(() => {
    reportWindowSize()
    resizeDebounceDelayedTimeout = undefined
  }, resizeDebounceDelay)
}

function handleDocumentResize() {
  reportWindowSizeDebouncedDelayed()
}

function handleDocumentMutation() {
  const rootElementSize = getRootElementSize()
  if (areDimensionsEqual(rootElementSize, lastRootElementSize)) {
    return
  }
  reportWindowSize()
  lastRootElementSize = rootElementSize
}

export function initPopout() {
  window.addEventListener('load', () => {
    if (!getRootElement()) {
      console.warn('Missing root element')
      return
    }
    reportWindowSize()
    new ResizeObserver(handleDocumentResize).observe(document.body)
    new MutationObserver(handleDocumentMutation).observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
    })
    // Make sure the document is properly styled for the popout
    document.documentElement.classList.add('popout')
  })
}
