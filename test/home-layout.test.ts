/**
 * The homepage's research sits in a closed <details>, so a fragment that names
 * a section inside it has nothing to scroll to until the disclosure opens.
 * These check the two halves of that: decoding the hash, and opening the way in.
 */
import { expect, test } from "vitest";

import { hashId, openAncestorDetails } from "../src/ui/hash-target";

/** A node with the shape the walker needs, and a child to walk up from. */
interface Fake {
  tagName: string;
  open: boolean;
  parentElement: Fake | null;
}
const node = (tagName: string, parentElement: Fake | null = null): Fake => ({
  tagName,
  open: false,
  parentElement,
});

test("a hash names the id it points at", () => {
  expect(hashId("#methodology")).toBe("methodology");
  expect(hashId("#agentic")).toBe("agentic");
});

test("a hash is decoded, so a percent-encoded id still resolves", () => {
  expect(hashId("#a%20b")).toBe("a b");
});

test("a hash that names nothing is ignored", () => {
  expect(hashId("")).toBeNull();
  expect(hashId("#")).toBeNull();
  expect(hashId("methodology")).toBeNull();
});

test("a malformed escape is ignored rather than thrown", () => {
  expect(hashId("#%")).toBeNull();
  expect(hashId("#%E0%A4%A")).toBeNull();
});

test("every disclosure above a target opens, and nothing else does", () => {
  const root = node("MAIN");
  const details = node("DETAILS", root);
  const target = node("SECTION", details);

  openAncestorDetails(target);

  expect(details.open).toBe(true);
  expect(root.open).toBe(false);
  expect(target.open).toBe(false);
});

test("a target with no disclosure above it opens nothing", () => {
  const root = node("MAIN");
  const target = node("SECTION", root);

  openAncestorDetails(target);

  expect(root.open).toBe(false);
});
