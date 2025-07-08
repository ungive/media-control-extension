/**
 * Checks whether a media element is considered paused.
 *
 * @param element The media element.
 * @returns Whether the media element is considered paused.
 */
export function isMediaElementPaused(element: HTMLMediaElement): boolean {
  // Muted media is considered paused for now,
  // as the background script detects playing media through "audible" tabs.
  return element.paused || element.muted;
}

/**
 * Determines the current page's favicon URL.
 *
 * @returns The current page's favicon URL.
 */
export function getFaviconUrl(): URL | null {
  // return new URL("/favicon.ico", location.origin);

  // Use this if the above code doesn't find the right favicon at some point
  let ico: URL | null = null;
  let png: URL | null = null;
  for (const element of document.querySelectorAll('link[rel*=icon]')) {
    if (!(element instanceof HTMLLinkElement))
      continue;
    const href = element.getAttribute('href');
    if (href === null)
      continue;
    const url = new URL(href, location.origin);
    if (href.endsWith('.ico') && ico === null)
      ico = url;
    if (href.endsWith('.png') && png === null)
      png = url;
    if (ico !== null)
      break;
  }
  if (ico !== null)
    return ico;
  if (png !== null)
    return png;
  return null;
}
