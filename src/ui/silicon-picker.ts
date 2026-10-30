/**
 * 01 — which machine. Detection where a browser allows it, three selects where it
 * does not, and one ruler showing what the choice is worth.
 *
 * Detection failure is a normal state with a plain message. No web API reports
 * installed memory, so RAM is always the reader's own answer.
 */
import { html } from "lit-html";

import { CHIPS, DEFAULT_CHIP, chipFor, chipLabel } from "../data/silicon";
import { AMBIGUOUS_BINS, parseRenderer } from "../lib/silicon-detect";
import { QUANTS, QUANT_KEYS, type QuantKey } from "../lib/throughput";
import { el, mount, svg } from "./dom";

export interface Machine {
  chip: string;
  ram: number;
  quant: QuantKey;
  /** The chip was detected or picked by the reader — never a fallback the page chose. */
  known: boolean;
}

const RULER = { w: 700, h: 54, pad: 26 };

function readRenderer(): string | null {
  const gl = document.createElement("canvas").getContext("webgl");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
}

function renderRuler(chipId: string): void {
  const max = Math.max(...CHIPS.map(chip => chip.bandwidth.value));
  const x = (gbs: number) => RULER.pad + (gbs / max) * (RULER.w - RULER.pad * 2);
  const node = el("bandwidth-ruler");
  node.replaceChildren();
  node.append(svg("line", { class: "ax", x1: RULER.pad, y1: 30, x2: RULER.w - RULER.pad, y2: 30 }));

  for (const chip of CHIPS) {
    const here = chip.id === chipId;
    node.append(svg("line", {
      class: here ? "ruler-tick on" : "ruler-tick",
      x1: x(chip.bandwidth.value), y1: here ? 14 : 24,
      x2: x(chip.bandwidth.value), y2: here ? 44 : 36,
    }));
  }

  const chip = chipFor(chipId);
  node.append(svg("text", {
    class: "serieslabel", x: x(chip.bandwidth.value), y: 10, "text-anchor": "middle",
  }, `${chip.bandwidth.value} GB/s`));
  node.append(svg("text", { class: "tick", x: RULER.pad, y: 52 }, "0"));
  node.append(svg("text", { class: "tick", x: RULER.w - RULER.pad, y: 52, "text-anchor": "end" }, `${max} GB/s`));
}

function options(node: HTMLSelectElement, entries: [string, string][], selected: string): void {
  mount(node, html`${entries.map(([value, label]) => html`<option value=${value}>${label}</option>`)}`);
  node.value = selected;
}

export function wireSiliconPicker(onChange: (machine: Machine) => void): void {
  const detected = readRenderer();
  const parsed = detected && parseRenderer(detected, navigator.hardwareConcurrency || 0);
  const chipId = parsed ?? DEFAULT_CHIP;
  const machine: Machine = {
    chip: chipId, ram: chipFor(chipId).ram[0], quant: "q4", known: parsed != null,
  };

  const chipSelect = el("chip-select") as HTMLSelectElement;
  const ramSelect = el("ram-select") as HTMLSelectElement;
  const quantSelect = el("quant-select") as HTMLSelectElement;

  options(chipSelect, CHIPS.map(chip => [chip.id, chipLabel(chip)]), machine.chip);
  options(quantSelect, QUANT_KEYS.map(key =>
    [key, `${QUANTS[key].label} — ${QUANTS[key].bits} bits / parameter`]), machine.quant);

  const fillRam = () => {
    const ram = chipFor(machine.chip).ram;
    if (!ram.includes(machine.ram)) machine.ram = ram[0];
    options(ramSelect, ram.map(size => [String(size), `${size} GB`]), String(machine.ram));
  };

  const apply = () => {
    fillRam();
    renderRuler(machine.chip);
    onChange({ ...machine });
  };

  chipSelect.addEventListener("change", () => {
    machine.chip = chipSelect.value;
    machine.known = true;
    apply();
  });
  ramSelect.addEventListener("change", () => { machine.ram = Number(ramSelect.value); apply(); });
  quantSelect.addEventListener("change", () => { machine.quant = quantSelect.value as QuantKey; apply(); });

  mount(el("detect-note"), detectionNote(detected, chipId));
  apply();
}

function detectionNote(renderer: string | null, chipId: string) {
  const chip = chipFor(chipId);
  if (!renderer) {
    return html`Your browser exposes no GPU string at all, so nothing was detected.
      The table below is showing <strong>${chipLabel(chip)}</strong> — change it above.`;
  }
  const parsed = parseRenderer(renderer, navigator.hardwareConcurrency || 0);
  if (!parsed) {
    return html`Your browser reports its GPU as <code>${renderer}</code>, which names no Mac — Safari
      says this about every machine it runs on. Nothing was detected, which is a normal answer,
      not an error. The table below is showing <strong>${chipLabel(chip)}</strong> — change it above.`;
  }
  const ambiguous = AMBIGUOUS_BINS.some(name => chip.name === name);
  return html`Detected <strong>${chipLabel(chip)}</strong> from <code>${renderer}</code>
    and ${navigator.hardwareConcurrency || "?"} CPU cores.${ambiguous
      ? " Its two bins differ by GPU core count, which no browser reports, so the slower one is"
        + " assumed — correct it above if yours is the faster part."
      : ""}
    Installed memory is never detected: no web API exposes it. Set it yourself above.`;
}
