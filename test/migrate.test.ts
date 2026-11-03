import { describe, expect, test } from "bun:test";
import { balance, cleanHtml, finalize } from "../scripts/migrate/clean-html.ts";
import { bbcodeToHtml } from "../scripts/migrate/bbcode.ts";
import { naturalTitle } from "../scripts/migrate/songs.ts";
import { normalizeUrl, removeDeadLinks, videoKey } from "../scripts/migrate/dead-links.ts";
import { decodeEntities, repairLegacyChars, repairQuestionMarks, slugify, smartTitle, typography, Vocabulary } from "../scripts/migrate/text.ts";

const opts = { resolveLink: (h: string) => h.replace("http://www.charles-trenet.net", ""), resolveImage: (src: string) => ({ src: `/media/${src.split("/").pop()}`, width: 300, height: 200 }) };

describe("cleanHtml", () => {
  test("drops presentational markup and scripts, keeps structure", () => {
    const out = cleanHtml('<font face="Arial" color=red><b>Titre</b></font><br><br>Texte <i>en italique</i><script>alert(1)</script>', opts);
    expect(out).toBe("<p><strong>Titre</strong></p>\n<p>Texte <em>en italique</em></p>");
  });
  test("turns window.open pop-ups into plain links", () => {
    const out = cleanHtml(`<a href="#" onClick="window.open('http://www.charles-trenet.net/chansons/mer.html','mer');return(false)">La mer</a>`, opts);
    expect(out).toContain('<a href="/chansons/mer.html">La mer</a>');
    expect(out).not.toContain("onclick");
  });
  test("strips event handlers and styles", () => {
    const out = cleanHtml('<p style="color:red" onmouseover="x()">a <img src="x.jpg" onerror="evil()" align="right"></p>', opts);
    expect(out).not.toMatch(/style=|onmouseover|onerror/);
    expect(out).toContain('class="float-right"');
  });
  test("a stray </ before a tag does not hide it from cleaning", () => {
    const out = cleanHtml('Texte <br></<img src="http://www.charles-trenet.net/dominic/45t.jpg" hspace="5" align="center"> fin', opts);
    expect(out).toContain('<img src="/media/45t.jpg"');
    expect(out).not.toMatch(/&lt;\/|hspace|charles-trenet\.net/);
  });
  test("javascript: links are removed", () => {
    expect(cleanHtml('<a href="javascript:alert(1)">x</a>', { ...opts, resolveLink: () => null })).toBe("<p>x</p>");
  });
  test("Flash YouTube embeds become click-to-load figures", () => {
    const out = cleanHtml('<embed src="http://www.youtube.com/v/G7OnRFqeeHo&rel=1" type="application/x-shockwave-flash"></embed>', opts);
    expect(out).toContain('data-youtube="G7OnRFqeeHo"');
  });
  test("unterminated comments do not swallow the page", () => {
    expect(cleanHtml("<!-- mots clés <p>Et bron, bron</p>", opts)).toBe("<p>Et bron, bron</p>");
  });
  test("output is always balanced", () => {
    expect(balance("<p><a href=x>lien</p><p>suite</p>")).toBe('<p><a href=x>lien</a></p><p>suite</p>');
    expect(balance("<p>texte</em></p>")).toBe("<p>texte</p>");
    expect(finalize("<p><strong></strong></p><p>ok</p>")).toBe("<p>ok</p>");
  });
});

describe("text repair", () => {
  const vocab = new Vocabulary();
  vocab.add("La télévision publique a réalisé un documentaire consacré à Charles. D'autres émissions. L'émerveillement. Entraîner, entraîneront.");
  test("restores accents lost as '?'", () => {
    expect(repairQuestionMarks("La t?l?vision a r?alis? un film", vocab)).toBe("La télévision a réalisé un film");
  });
  test("standalone '?' is « à », and elided '?' is an apostrophe", () => {
    expect(repairQuestionMarks("consacr? ? Charles et d?autres", vocab)).toBe("consacré à Charles et d’autres");
    expect(repairQuestionMarks("la joie, l??merveillement", vocab)).toBe("la joie, l’émerveillement");
  });
  test("capitalised words before a lost « à »", () => {
    expect(repairQuestionMarks("Mis ? part la t?l?vision, Resto ? la gloire", vocab)).toBe("Mis à part la télévision, Resto à la gloire");
  });
  test("real question marks are kept", () => {
    expect(repairQuestionMarks("Pourquoi ? Parce que. Et t?l?vision", vocab)).toBe("Pourquoi ? Parce que. Et télévision");
  });
  test("Mac Roman letters mixed with CP1252 punctuation", () => {
    expect(decodeEntities("p&#146;tits, ann&#142;es, c&#156;ur")).toBe("p’tits, années, cœur");
    expect(repairLegacyChars("annŽes")).toBe("années");
  });
});

describe("titles", () => {
  const vocab = new Vocabulary();
  vocab.add("Charles Trenet chante à Paris et à Bruxelles. Le Québec, Bruxelles et Paris. Charles Trenet.");
  test("re-cases shouted titles", () => {
    expect(smartTitle("CHARLES TRENET A BRUXELLES", vocab)).toBe("Charles Trenet à Bruxelles");
    expect(smartTitle("LE SOLEIL A RENDEZ-VOUS AVEC LA LUNE", vocab)).toBe("Le soleil à rendez-vous avec la lune");
    expect(smartTitle("Déjà en minuscules", vocab)).toBe("Déjà en minuscules");
  });
  test("catalogue titles", () => {
    expect(naturalTitle("Abbé à l'harmonium (l')")).toBe("L'abbé à l'harmonium");
    expect(naturalTitle("Mer (la)")).toBe("La mer");
  });
  test("typography and slugs", () => {
    expect(typography('Carla Bruni chante "Douce France"...')).toBe("Carla Bruni chante «\u00a0Douce France\u00a0»…");
    expect(slugify("Y'a d'la joie !")).toBe("y-a-d-la-joie");
  });
});

describe("bbcode", () => {
  const o = { resolveLink: (h: string) => h, resolveImage: () => null };
  test("formats, quotes, smilies and redacts e-mails", () => {
    const out = bbcodeToHtml("[quote=Ann]Bonjour[/quote]\nMerci [b]beaucoup[/b] :) écrivez à jean@example.com", o);
    expect(out).toContain("<blockquote><cite>Ann</cite>Bonjour</blockquote>");
    expect(out).toContain("<strong>beaucoup</strong> 🙂");
    expect(out).toContain("[adresse masquée]");
    expect(out).not.toContain("example.com");
  });
  test("escapes HTML", () => {
    expect(bbcodeToHtml('<script>alert(1)</script>', o)).not.toContain("<script>");
  });
});

describe("dead links", () => {
  const dead = Object.assign(new Set(["http://youtu.be/deaddeadAAA", "http://www.dailymotion.com/video/xdead", "http://gone.example/page.html"].map(normalizeUrl)), {
    noEmbed: new Set(["onlyOnYTube"]),
  });
  test("a dead video disappears with its embed and its thumbnail", () => {
    const html = '<p>Avant.</p>\n<figure data-youtube="deaddeadAAA"><a href="https://www.youtube.com/watch?v=deaddeadAAA">Voir la vidéo sur YouTube</a></figure>\n<p><a href="https://www.youtube.com/watch?v=deaddeadAAA&amp;feature=related"><img src="/media/video-x.jpg" alt=""></a></p>\n<p>Après.</p>';
    expect(removeDeadLinks(html, dead)).toBe("<p>Avant.</p>\n<p>Après.</p>");
  });
  test("bare addresses and 'voir la vidéo' go; words in a sentence stay", () => {
    expect(removeDeadLinks('<p>La mer<br><a href="http://www.dailymotion.com/video/xdead">www.dailymotion.com/video/xdead…</a></p>', dead)).toBe("<p>La mer<br></p>");
    expect(removeDeadLinks('<p><a href="http://youtu.be/deaddeadAAA">Voir la vidéo</a></p>', dead)).toBe("");
    expect(removeDeadLinks('<p>pour <em><a href="http://youtu.be/deaddeadAAA">Le temps qui passe</a></em>, et</p>', dead)).toBe("<p>pour <em>Le temps qui passe</em>, et</p>");
    expect(removeDeadLinks('<p>Voir <a href="http://gone.example/page.html">ce site</a> et <a href="https://alive.example/">celui-ci</a>.</p>', dead)).toBe('<p>Voir ce site et <a href="https://alive.example/">celui-ci</a>.</p>');
  });
  test("videos that only play on YouTube become a link", () => {
    expect(removeDeadLinks('<figure data-youtube="onlyOnYTube"><a href="https://www.youtube.com/watch?v=onlyOnYTube">Voir la vidéo sur YouTube</a></figure>', dead)).toContain('<p><a href="https://www.youtube.com/watch?v=onlyOnYTube"');
  });
  test("recognises video addresses", () => {
    expect(videoKey("http://de.youtube.com/watch?v=7qhbJYtIiAI&amp;feature=related")).toEqual({ service: "youtube", id: "7qhbJYtIiAI" });
    expect(videoKey("http://youtu.be/g701EAbCANo_blank")).toEqual({ service: "youtube", id: "g701EAbCANo" });
    expect(videoKey("http://www.dailymotion.com/video/xif8v_charles-trenet-la-mer_news")).toEqual({ service: "dailymotion", id: "xif8v" });
    expect(videoKey("http://fr.wikipedia.org/wiki/Charles_Trenet")).toBeNull();
  });
});
