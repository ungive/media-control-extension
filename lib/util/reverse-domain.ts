import { Tabs } from "wxt/browser";

/**
 * Namespace for functions to deal with reverse domains.
 */
export namespace ReverseDomain {

  export interface Options {
    /**
     * Whether to include "www" in the reverse domain.
     * The default is false, as this would give two versions
     * of essentially the same domain name.
     */
    www: boolean
  }

  export const defaultOptions = {
    www: false
  }

  export function forDomain(
    domain: string,
    options = defaultOptions
  ): string {
    const parts = domain.split('.').map(e => e.trim());
    if (!options.www && parts.length > 0 && parts[0] === 'www') {
      parts.shift();
    }
    return parts.reverse().join('.');
  }

  export function forLocation(
    location: Location = window.location,
    options = defaultOptions
  ): string {
    return forDomain(location.hostname, options);
  }

  export function forUrl(
    url: URL | string,
    options = defaultOptions
  ): string {
    if (!(url instanceof URL)) {
      url = new URL(url);
    }
    return forDomain(url.hostname, options);
  }

  export function forTab(
    tab: Tabs.Tab,
    options = defaultOptions
  ): string | undefined {
    return tab.url ? forUrl(new URL(tab.url), options) : undefined;
  }
}
