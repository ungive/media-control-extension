type RootElement = Element | ShadowRoot;

export interface ResourceInfo {
  title: string
  artist: string
  album: string
}

export enum ResourceType {
  Track,
  Album,
  Artist
}

export interface ResourceLinkPatterns {
  track: RegExp | undefined
  album: RegExp | undefined
  artist: RegExp | undefined
}

interface ClosestNodeAncestor<N1 extends Node, N2 extends Node> {
  first: {
    node: N1
    depth: number
  }
  second: {
    node: N2
    depth: number
  }
  ancestor: Node
  minDepth: number
  maxDepth: number
}

function findRootNodes(start: RootElement = document.body): RootElement[] {
  const roots: RootElement[] = [start];
  const next: Node[] = [...roots];
  while (next.length > 0) {
    const current = next.shift()!;
    if (!(current instanceof HTMLElement)) {
      continue;
    }
    if (current.shadowRoot) {
      roots.push(current.shadowRoot);
    }
    for (const element of current.children) {
      next.push(element);
    }
  }
  return roots;
}

function findClosestAncestor(a: Node, b: Node): Node {
  let range = new Range();
  range.setStart(a, 0);
  range.setEnd(b, 0);
  if (range.collapsed) {
    range.setStart(b, 0);
    range.setEnd(a, 0);
  }
  return range.commonAncestorContainer;
}

function findDistanceFromAncestor(node: Node, ancestor: Node): number | undefined {
  let current: Node | null = node;
  let distance = 0;
  while (current && current !== ancestor) {
    distance++;
    current = current.parentNode;
  }
  if (current !== ancestor) {
    return undefined;
  }
  return distance;
}

/**
 * Finds the node among a set of candidate nodes that is closest
 * to the common ancestor of the given node and the candidate node.
 *
 * @param node The given node.
 * @param candidates A set of candidate nodes.
 * @returns The candidate node that is closest to the common ancestor.
 */
function findNodeWithClosestAncestor<N1 extends Node, N2 extends Node>(
  node: N1,
  candidates: N2[]
): [N2, Node] | null {
  let closest: {
    node: N2,
    ancestor: Node,
    minDepth: number,
    maxDepth: number
  } | null = null;
  for (const candidate of candidates) {
    const ancestor = findClosestAncestor(node, candidate);
    const d1 = findDistanceFromAncestor(node, ancestor);
    const d2 = findDistanceFromAncestor(candidate, ancestor);
    if (!d1 || !d2) {
      console.assert(false, "incorrect ancestor for node");
      continue;
    }
    const min = Math.min(d1, d2);
    const max = Math.max(d1, d2);
    if (!closest
      || min < closest.minDepth
      || min === closest.minDepth && max < closest.maxDepth) {
      closest = {
        node: candidate,
        ancestor: ancestor,
        minDepth: min,
        maxDepth: max
      };
    }
  }
  return closest ? [closest.node, closest.ancestor] : null;
}

/**
 * Finds the two nodes among two sets of nodes that are closest
 * to their common DOM ancestor.
 *
 * @param largestSet The first set of nodes with the most elements.
 * @param smallestSet The second set of nodes with the least elements.
 * @returns The two nodes that are closest to their common ancestor.
 */
function findPairsWithClosestAncestor<N extends Node>(
  largestSet: N[],
  smallestSet: N[]
): ClosestNodeAncestor<N, N>[] {
  let match: ClosestNodeAncestor<N, N> | null = null;
  let additionalEqualMatches: ClosestNodeAncestor<N, N>[] = [];
  for (const first of largestSet) {
    const result = findNodeWithClosestAncestor(first, smallestSet);
    if (!result) {
      continue;
    }
    const [second, ancestor] = result;
    const d1 = findDistanceFromAncestor(first, ancestor);
    const d2 = findDistanceFromAncestor(second, ancestor);
    if (!d1 || !d2) {
      console.assert(false, "incorrect ancestor for node");
      continue;
    }
    const min = Math.min(d1, d2);
    const max = Math.max(d1, d2);
    if (!match
      || min < match.minDepth
      || min === match.minDepth && max < match.maxDepth
      || min === match.minDepth && max === match.maxDepth) {
      const nextMatch: ClosestNodeAncestor<N, N> = {
        first: {
          node: first,
          depth: d1
        },
        second: {
          node: second,
          depth: d2
        },
        ancestor,
        minDepth: min,
        maxDepth: max
      };
      if (match === null) {
        match = nextMatch;
        additionalEqualMatches = [];
      }
      else {
        additionalEqualMatches.push(nextMatch);
      }
    }
  }
  if (match !== null)
    return [match, ...additionalEqualMatches];
  console.assert(additionalEqualMatches.length === 0,
    "There are additional matches without a primary match");
  return [];
}

/**
 * Finds all resource links under the given list of {@link roots}
 * that conform to the given set of parameters.
 *
 * Only elements are returned whose full path name (with leading slash)
 * match the given {@link pathPattern} and whose innerText matches
 * the given {@link innerText}, either case-sensitive or -insensitive,
 * depending on the value of {@link caseInsensitive},
 * and either exactly or merely as a prefix,
 * depending on the value of {@link innerTextStartsWith}.
 *
 * @param pathPattern The pattern to match against the pathname of any URL.
 * @param innerText The innerText that the link element should contain.
 * @param caseInsensitive Whether to match {@link innerText} case-insensitive.
 * @param innerTextIncludes Whether to match {@link innerText} as substring.
 * @param roots The set of {@link RootElement} elements to search under.
 * @returns
 */
function findResourceLinks(
  pathPattern: RegExp,
  innerText: string,
  caseInsensitive: boolean = false,
  innerTextIncludes: boolean = false,
  roots: RootElement[] = findRootNodes()
): HTMLLinkElement[] {
  innerText = innerText.trim();
  const elements: Set<HTMLLinkElement> = new Set();
  for (const root of roots) {
    const links = root.querySelectorAll<HTMLLinkElement>('a[href]');
    for (const element of links) {
      // Make sure to resolve the entire URL by accessing the href attribute.
      const path = new URL(element.href).pathname;
      if (!pathPattern.test(path)) {
        continue;
      }
      const text = element.innerText.trim();
      if (text.length === 0) {
        continue;
      }
      let textMatches = false;
      if (innerTextIncludes) {
        textMatches = innerText.includes(text)
          || caseInsensitive && innerText.toUpperCase().includes(text.toUpperCase());
      }
      else {
        textMatches = text === innerText
          || caseInsensitive && text.toUpperCase() === innerText.toUpperCase();
      }
      if (textMatches) {
        elements.add(element);
      }
    }
  }
  return Array.from(elements);
}

/**
 * Finds those resource links that match best for the given {@link metadata}.
 *
 * Links are filtered with the given {@link ResourceLinkPatterns},
 * so that only link elements are considered that have the correct url format.
 *
 * To make sure that resource links belong together contextually,
 * links aren't individually extracted from the document, which would be naive,
 * but are compared against each other in such a way,
 * to make sure they appear in the same context,
 * e.g. on the same line, under the same container element
 * and without too much distance from one another.
 *
 * This function works under the premise that each web player
 * contains at least *some* links to the song that is currently being played
 * and/or the artist of the song and maybe the album it appears in.
 * Not surprisingly, this is the case with all web players
 * and the function works very reliably
 * without making any substantial assumptions about the layout of the page
 * that might be individual to a specific web player, but not to another.
 *
 * @param metadata
 * @param linkPatterns
 * @returns A map that maps a substring to a URL for each resource type.
 */
export function findBestMatchingResourceLinks(
  metadata: ResourceInfo,
  linkPatterns: ResourceLinkPatterns
): Map<ResourceType, Map<string, string>> {

  // FIXME this seems to be called *very* often between track changes.
  // console.log('metadata', metadata);

  if (!linkPatterns.track && !linkPatterns.album && !linkPatterns.artist) {
    return new Map();
  }
  const roots = findRootNodes();
  const linkElements: Map<ResourceType, HTMLLinkElement[]> = new Map();
  if (linkPatterns.track) {
    linkElements.set(
      ResourceType.Track,
      findResourceLinks(linkPatterns.track, metadata.title, false, false, roots)
    );
    if ((linkElements.get(ResourceType.Track)?.length ?? 0) === 0) {
      linkElements.delete(ResourceType.Track);
    }
    // console.log('track', linkElements.get(ResourceType.Track));
  }
  if (linkPatterns.album) {
    linkElements.set(
      ResourceType.Album,
      findResourceLinks(linkPatterns.album, metadata.album, false, false, roots)
    );
    if ((linkElements.get(ResourceType.Album)?.length ?? 0) === 0) {
      // Sometimes the track title links to the album instead.
      linkElements.set(
        ResourceType.Album,
        findResourceLinks(linkPatterns.album, metadata.title, false, false, roots)
      );
    }
    if ((linkElements.get(ResourceType.Album)?.length ?? 0) === 0) {
      // Sometimes the album name is in all uppercase (like on TIDAL).
      linkElements.set(
        ResourceType.Album,
        findResourceLinks(linkPatterns.album, metadata.album, true, false, roots)
      );
    }
    if ((linkElements.get(ResourceType.Album)?.length ?? 0) === 0) {
      linkElements.delete(ResourceType.Album);
    }
    // console.log('album', linkElements.get(ResourceType.Album));
  }
  if (linkPatterns.artist) {
    // There can be multiple artists combined in the metadata text,
    // so find links whose text is contained inside that metadata text,
    // instead of matching exactly.
    linkElements.set(
      ResourceType.Artist,
      findResourceLinks(linkPatterns.artist, metadata.artist, true, true, roots)
    );
    if ((linkElements.get(ResourceType.Artist)?.length ?? 0) === 0) {
      linkElements.delete(ResourceType.Artist);
    }
    // console.log('artist', linkElements.get(ResourceType.Artist));
  }
  if (linkElements.size === 0) {
    return new Map();
  }

  const ancestorPairs: {
    pairs: ClosestNodeAncestor<HTMLLinkElement, HTMLLinkElement>[],
    firstType: ResourceType,
    secondType: ResourceType
  }[] = []
  if (linkElements.has(ResourceType.Album) && linkElements.has(ResourceType.Artist)) {
    const result = findPairsWithClosestAncestor(
      linkElements.get(ResourceType.Artist)!, // the artists set is always larger
      linkElements.get(ResourceType.Album)!
    );
    if (result.length > 0) {
      ancestorPairs.push({
        pairs: result,
        firstType: ResourceType.Artist,
        secondType: ResourceType.Album
      });
    }
  }
  if (linkElements.has(ResourceType.Album) && linkElements.has(ResourceType.Track)) {
    const result = findPairsWithClosestAncestor(
      linkElements.get(ResourceType.Album)!,
      linkElements.get(ResourceType.Track)!
    );
    if (result.length > 0) {
      ancestorPairs.push({
        pairs: result,
        firstType: ResourceType.Album,
        secondType: ResourceType.Track
      });
    }
  }
  if (linkElements.has(ResourceType.Artist) && linkElements.has(ResourceType.Track)) {
    const result = findPairsWithClosestAncestor(
      linkElements.get(ResourceType.Artist)!, // the artists set is always larger
      linkElements.get(ResourceType.Track)!
    );
    if (result.length > 0) {
      ancestorPairs.push({
        pairs: result,
        firstType: ResourceType.Artist,
        secondType: ResourceType.Track
      });
    }
  }

  // Find the node pair that has the smallest distance to its ancestor and,
  // if the smallest distance is identical, has the smallest difference
  // between the minimum and the maximum distance to the ancestor.
  // This will get us the node pairs which most likely belong together
  // and therefore most likely represent links to the desired
  // title/artist/album combination that is currently playing.
  ancestorPairs.sort((a, b) => {
    // All of these inner pairs have the same minDepth,
    // see findPairsWithClosestAncestor().
    if (a.pairs[0].minDepth < b.pairs[0].minDepth) {
      return -1;
    }
    if (a.pairs[0].minDepth === b.pairs[0].minDepth) {
      return (a.pairs[0].maxDepth - a.pairs[0].minDepth)
        - (b.pairs[0].maxDepth - b.pairs[0].minDepth);
    }
    return 1;
  });

  // Construct the map of resource links in the following way:
  // Each resource type is mapped to a map of a text string to a URL.
  // For titles and albums the entire text will link to a single URL,
  // but for artists there may be multiple URLs for each individual artist.
  const urls: Map<ResourceType, Map<string, string>> = new Map();
  for (const pair of ancestorPairs) {
    for (const element of pair.pairs) {
      if (!urls.has(pair.firstType)) {
        urls.set(pair.firstType, new Map([
          [element.first.node.innerText, element.first.node.href]
        ]));
      }
      else if (!urls.get(pair.firstType)!.has(element.first.node.innerText)) {
        urls.get(pair.firstType)!.set(
          element.first.node.innerText,
          element.first.node.href
        );
      }
      if (!urls.has(pair.secondType)) {
        urls.set(pair.secondType, new Map([
          [element.second.node.innerText, element.second.node.href]
        ]));
      }
      else if (!urls.get(pair.secondType)!.has(element.second.node.innerText)) {
        urls.get(pair.secondType)!.set(
          element.second.node.innerText,
          element.second.node.href
        );
      }
    }
  }

  // Apply any URLs that have been found as a fallback.
  for (const resourceType of [ResourceType.Track, ResourceType.Album, ResourceType.Artist]) {
    if (!urls.has(resourceType) && linkElements.has(resourceType)) {
      for (const resourceUrl of linkElements.get(resourceType)!) {
        let text = '';
        switch (resourceType) {
          case ResourceType.Track: text = metadata.title; break;
          case ResourceType.Album: text = metadata.album; break;
          case ResourceType.Artist: text = metadata.artist; break;
          default:
            console.assert(false);
            continue;
        }
        console.assert(text.length > 0);
        const innerText = resourceUrl.innerText.trim();
        if (!text.includes(innerText)) {
          continue;
        }
        const href = resourceUrl.href;
        if (!urls.has(resourceType)) {
          urls.set(resourceType, new Map([[innerText, href]]));
        }
        else if (!urls.get(resourceType)!.has(innerText)) {
          urls.get(resourceType)!.set(innerText, href);
        }
      }
    }
  }

  return urls;
}
