import { describe, expect, it } from "vitest";

import { markCode } from "../src/ui/highlight";

describe("markCode", () => {
  it("marks the command, its flags and its placeholders", () => {
    const out = markCode("git clone <this repository>\npnpm gate status --smoke", "sh");
    expect(out).toContain('<span class="t-name">git</span>');
    expect(out).toContain('<span class="t-ph">&lt;this repository&gt;</span>');
    expect(out).toContain('<span class="t-lit">--smoke</span>');
  });

  it("marks an exported variable without swallowing its value", () => {
    const out = markCode("export LITELLM_MASTER_KEY=sk-local-anything", "sh");
    expect(out).toContain('<span class="t-name">LITELLM_MASTER_KEY</span>=sk-local-anything');
  });

  it("comments out a whole line, and never a mid-line hash", () => {
    expect(markCode("# a note", "sh")).toBe('<span class="t-com"># a note</span>');
  });

  it("separates JSON keys from string values", () => {
    const out = markCode('{"model": "a", "n": 2, "ok": true}', "json");
    expect(out).toContain('<span class="t-name">"model"</span>:');
    expect(out).toContain('<span class="t-str">"a"</span>');
    expect(out).toContain('<span class="t-lit">2</span>');
    expect(out).toContain('<span class="t-lit">true</span>');
  });

  it("escapes markup before it marks anything", () => {
    expect(markCode('{"x": "<b>"}', "json")).not.toContain("<b>");
  });
});
