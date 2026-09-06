// Turns a title into a URL slug. Known-buggy on purpose: this file is the
// wl-001 measurement fixture — see workload.md before "fixing" it in a commit.
export function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  // Bugs the task must find: leading/trailing separators survive
  // ("Hello, World!" → "hello-world-"), and diacritics are dropped entirely
  // ("Été à Paris" → "-t-paris") instead of being transliterated.
}
