import { ReverseDomain } from "./reverse-domain";

/**
 * Determines the current page's favicon URL.
 *
 * @returns The current page's favicon URL.
 */
export function getFaviconUrl(): URL | undefined {
  let icon: URL | undefined = undefined
  for (const element of document.querySelectorAll('link[rel*=icon]')) {
    const relItems = element.getAttribute('rel')?.split(' ');
    if (relItems === undefined || !relItems.includes("icon")) {
      continue;
    }
    const href = element.getAttribute('href');
    if (href === null) {
      continue;
    }
    if (href.endsWith(".ico") || href.endsWith(".png")) {
      icon = new URL(href, location.origin);
      break;
    }
  }
  if (icon === undefined) {
    // Fall back to the favicon in the server root.
    icon = new URL("favicon.ico", location.origin);
  }
  return icon;
}

/**
 * Returns the URL of the page.
 *
 * @returns The URL of the page.
 */
export function getPageUrl(): URL {
  return new URL(window.location.href);
}

/**
 * Returns the reverse domain of the page.
 *
 * @returns The reverse domain of the page.
 */
export function getReverseDomain(): string {
  return ReverseDomain.forUrl(getPageUrl());
}
