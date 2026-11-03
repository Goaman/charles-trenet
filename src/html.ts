/**
 * Tiny HTML templating: a tagged template that escapes interpolations unless
 * they are explicitly marked safe with raw() (or are nested html`` results).
 */

const SAFE = Symbol("safe-html");

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
  toString(): string;
}

function safe(value: string): SafeHtml {
  return { [SAFE]: true, value, toString: () => value };
}

export function isSafe(v: unknown): v is SafeHtml {
  return typeof v === "object" && v !== null && SAFE in v;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

type Value = SafeHtml | string | number | boolean | null | undefined | Value[];

function render(v: Value): string {
  if (v === null || v === undefined || v === false || v === true) return "";
  if (Array.isArray(v)) return v.map(render).join("");
  if (isSafe(v)) return v.value;
  return escape(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += render(values[i]!) + strings[i + 1]!;
  return safe(out);
}

/** Trusted HTML (content from our own database, already sanitised by the migration). */
export function raw(s: string | null | undefined): SafeHtml {
  return safe(s ?? "");
}

export function join(items: Value[], sep: Value = ""): SafeHtml {
  return safe(items.map(render).join(render(sep)));
}
