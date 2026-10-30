/**
 * A fragment link can point inside a closed <details>, where the browser has
 * nothing to scroll to — the target is not rendered. Opening the disclosure
 * that holds it first is what makes those links work.
 */

/** The bits of a node this module needs: enough to walk up and open. */
interface Ancestor {
  readonly tagName: string;
  open?: boolean;
  readonly parentElement: Ancestor | null;
}

/** The id a hash names, decoded. Null when the hash is empty or malformed. */
export function hashId(hash: string): string | null {
  if (!hash.startsWith("#")) return null;
  const raw = hash.slice(1);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Opens every <details> between the target and the root of the document. */
export function openAncestorDetails(target: Ancestor): void {
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (node.tagName.toLowerCase() === "details") node.open = true;
  }
}

/**
 * Opens the disclosure hiding a fragment's target, then scrolls to it.
 * False when the hash names nothing on the page.
 */
export function revealHashTarget(hash: string, behavior: ScrollBehavior = "smooth"): boolean {
  const id = hashId(hash);
  if (!id) return false;
  const target = document.getElementById(id);
  if (!target) return false;
  openAncestorDetails(target);
  target.scrollIntoView({ block: "start", behavior });
  return true;
}
