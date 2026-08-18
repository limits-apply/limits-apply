import { render, type TemplateResult } from "lit-html";

/** Element by id, loudly. A missing id is a bug in the markup, not a runtime branch. */
export function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
}

export function mount(node: HTMLElement, content: TemplateResult): void {
  render(content, node);
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG element from attributes + optional text. */
export function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, String(attrs[k]));
  if (text != null) node.textContent = text;
  return node;
}
