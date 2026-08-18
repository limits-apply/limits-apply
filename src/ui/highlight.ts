const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ESC[c]);
const tag = (cls: string, text: string) => `<span class="t-${cls}">${text}</span>`;

const SHELL = /("[^"]*"|'[^']*')|(&lt;[^&]*?&gt;)|(?<=\s)(--?[\w-]+)|([A-Za-z_][A-Za-z0-9_]*)(?==)/g;
const JSON_TOK = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(-?\d+(?:\.\d+)?)\b|\b(?:true|false|null)\b/g;

function shell(line: string): string {
  const src = esc(line);
  if (/^\s*#/.test(src)) return tag("com", src);
  const head = src.match(/^(\s*)([\w./:-]+)/);
  if (!head) return src;
  const rest = src.slice(head[0].length).replace(SHELL, (m, str, ph, flag) =>
    str ? tag("str", m) : ph ? tag("ph", m) : flag ? tag("lit", m) : tag("name", m),
  );
  return head[1] + tag("name", head[2]) + rest;
}

const json = (src: string) =>
  esc(src).replace(JSON_TOK, (m, str, colon, num) =>
    str ? tag(colon ? "name" : "str", str) + (colon ?? "") : tag("lit", num ?? m),
  );

export const markCode = (source: string, lang: "sh" | "json"): string =>
  lang === "json" ? json(source) : source.split("\n").map(shell).join("\n");

export function highlightCode(root: ParentNode = document): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre code.lang-sh, pre code.lang-json")) {
    code.innerHTML = markCode(code.textContent ?? "", code.classList.contains("lang-json") ? "json" : "sh");
  }
}
