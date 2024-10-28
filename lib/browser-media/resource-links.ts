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
 * @param firstSet The first set of nodes.
 * @param secondSet The second set of nodes.
 * @returns The two nodes that are closest to their common ancestor.
 */
function findPairWithClosestAncestor<N1 extends Node, N2 extends Node>(
  firstSet: N1[],
  secondSet: N2[]
): ClosestNodeAncestor<N1, N2> | null {
  let match: ClosestNodeAncestor<N1, N2> | null = null;
  for (const first of firstSet) {
    const result = findNodeWithClosestAncestor(first, secondSet);
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
      || min === match.minDepth && max < match.maxDepth) {
      match = {
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
    }
  }
  return match;
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
 * @param innerTextStartsWith Whether to match {@link innerText} as a prefix.
 * @param roots The set of {@link RootElement} elements to search under.
 * @returns 
 */
function findResourceLinks(
  pathPattern: RegExp,
  innerText: string,
  caseInsensitive: boolean = false,
  innerTextStartsWith: boolean = false,
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
      let textMatches = false;
      if (innerTextStartsWith) {
        textMatches = innerText.startsWith(text)
          || caseInsensitive && innerText.toUpperCase().startsWith(text.toUpperCase());
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
 * @returns 
 */
export function findBestMatchingResourceLinks(
  metadata: ResourceInfo,
  linkPatterns: ResourceLinkPatterns
): Map<ResourceType, string> {
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
      findResourceLinks(linkPatterns.artist, metadata.artist, false, true, roots)
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
    pairs: ClosestNodeAncestor<HTMLLinkElement, HTMLLinkElement>,
    firstType: ResourceType,
    secondType: ResourceType
  }[] = []
  if (linkElements.has(ResourceType.Album) && linkElements.has(ResourceType.Artist)) {
    const result = findPairWithClosestAncestor(
      linkElements.get(ResourceType.Album)!,
      linkElements.get(ResourceType.Artist)!
    );
    if (result) {
      ancestorPairs.push({
        pairs: result,
        firstType: ResourceType.Album,
        secondType: ResourceType.Artist
      });
    }
  }
  if (linkElements.has(ResourceType.Album) && linkElements.has(ResourceType.Track)) {
    const result = findPairWithClosestAncestor(
      linkElements.get(ResourceType.Album)!,
      linkElements.get(ResourceType.Track)!
    );
    if (result) {
      ancestorPairs.push({
        pairs: result,
        firstType: ResourceType.Album,
        secondType: ResourceType.Track
      });
    }
  }
  if (linkElements.has(ResourceType.Artist) && linkElements.has(ResourceType.Track)) {
    const result = findPairWithClosestAncestor(
      linkElements.get(ResourceType.Artist)!,
      linkElements.get(ResourceType.Track)!
    );
    if (result) {
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
    if (a.pairs.minDepth < b.pairs.minDepth) {
      return -1;
    }
    if (a.pairs.minDepth === b.pairs.minDepth) {
      return (a.pairs.maxDepth - a.pairs.minDepth)
        - (b.pairs.maxDepth - b.pairs.minDepth);
    }
    return 1;
  });

  const urls: Map<ResourceType, string> = new Map();
  for (const pair of ancestorPairs) {
    if (!urls.has(pair.firstType)) {
      urls.set(pair.firstType, pair.pairs.first.node.href);
    }
    if (!urls.has(pair.secondType)) {
      urls.set(pair.secondType, pair.pairs.second.node.href);
    }
  }
  for (const resourceType of [ResourceType.Track, ResourceType.Album, ResourceType.Artist]) {
    if (!urls.has(resourceType) && linkElements.has(resourceType)) {
      const resourceUrls = linkElements.get(resourceType)!;
      if (resourceUrls.length > 0) {
        urls.set(resourceType, resourceUrls[0].href);
      }
    }
  }

  // console.log([...urls.entries()].map(e => [ResourceType[e[0]], e[1]]));
  return urls;
}
