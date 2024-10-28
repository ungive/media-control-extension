import { Proto } from "../proto";

import BrowserType = Proto.BrowserMedia.BrowserType;

// Declarations for global variables
// that might be defined by some browser vendors.
declare global {
  let opr: unknown;
}

export {
  BrowserType
}

/**
 * Get the current browser this background or content script is running in.
 * 
 * @returns The {@link Proto.BrowserMedia.BrowserType}
 * for the current browser.
 */
export function getCurrentBrowser(): BrowserType {
  // Vendors that have their own extension type
  // which does not work with any other browser vendor.
  // Chrome is left out here, as there are many different vendors
  // which use chromium under the hood.
  if (import.meta.env.SAFARI) return BrowserType.SAFARI;
  if (import.meta.env.FIREFOX) return BrowserType.FIREFOX;
  // Chrome variations.
  if ('brave' in navigator && typeof navigator.brave !== 'undefined')
    return BrowserType.CHROMIUM_BRAVE;
  if (typeof opr !== 'undefined')
    return BrowserType.CHROMIUM_OPERA;
  if (navigator.userAgent.indexOf("Edg/") > -1)
    return BrowserType.CHROMIUM_EDGE;
  if ('userAgentData' in navigator) {
    const brands = navigator.userAgentData?.brands;
    if (brands?.find(value => value.brand.includes('Google'))) {
      return BrowserType.CHROMIUM_CHROME;
    }
  }
  // Just Chromium otherwise.
  return BrowserType.CHROMIUM;
}
