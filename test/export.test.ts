import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// The export crawls the whole site and exits non-zero on any broken internal link.
test("static export: every page, no broken link, base path applied", () => {
  const out = join(tmpdir(), `ct-export-${process.pid}`);
  try {
    const run = Bun.spawnSync(["bun", "scripts/export.ts", "--out", out, "--site-url", "https://example.org/sous-dossier"], {
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, STATIC_EXPORT: "" },
    });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);
    for (const f of ["index.html", "404.html", "chansons.html", "chansons/la-mer.html", "chansons/index.html", "recherche.html", "hasard.html", "flux.xml", ".nojekyll", "assets/site.css"]) {
      expect(existsSync(join(out, f))).toBe(true);
    }
    const home = readFileSync(join(out, "index.html"), "utf8");
    expect(home).toContain('data-base="/sous-dossier"');
    expect(home).toContain('href="/sous-dossier/chansons"');
    expect(home).not.toMatch(/(href|src)="\/(?!\/|sous-dossier)/);
    expect(home).toContain("http-equiv=\"Content-Security-Policy\"");
    // A redirect page (lyrics of a catalogue song → the song page)
    expect(readFileSync(join(out, "textes", "a-ciel-ouvert.html"), "utf8")).toMatch(/http-equiv="refresh" content="0; url=\/sous-dossier\/chansons\//);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}, 60_000);
