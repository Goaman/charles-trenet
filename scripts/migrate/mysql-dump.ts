/**
 * Minimal streaming-free parser for the charles-trenet.net MySQL dump.
 *
 * The dump is a plain `mysqldump`-style file (CREATE TABLE + extended INSERTs)
 * written with `SET NAMES binary`; the data is Windows-1252 (latin1 in MySQL).
 * We only need: database switches (USE), column names (CREATE TABLE) and rows
 * (INSERT INTO ... VALUES (...),(...);).
 */

export type Row = Record<string, string | null>;
export interface Table {
  name: string;
  columns: string[];
  rows: Row[];
}
export type Database = Map<string, Table>;

const ESCAPES: Record<string, string> = {
  "0": "\0", n: "\n", r: "\r", t: "\t", b: "\b", Z: "\x1a",
  "\\": "\\", "'": "'", '"': '"', "%": "\\%", _: "\\_",
};

export function parseDump(sql: string): Map<string, Database> {
  const dbs = new Map<string, Database>();
  let current: Database | undefined;
  let i = 0;
  const n = sql.length;

  const skipWs = () => {
    while (i < n && /\s/.test(sql[i]!)) i++;
  };
  const readIdent = (): string => {
    skipWs();
    if (sql[i] === "`") {
      const end = sql.indexOf("`", i + 1);
      const id = sql.slice(i + 1, end);
      i = end + 1;
      return id;
    }
    const m = /^[A-Za-z0-9_]+/.exec(sql.slice(i, i + 128));
    i += m ? m[0].length : 0;
    return m ? m[0] : "";
  };
  const readValue = (): string | null => {
    skipWs();
    if (sql[i] === "'") {
      i++;
      let out = "";
      let start = i;
      while (i < n) {
        const c = sql[i]!;
        if (c === "\\") {
          out += sql.slice(start, i) + (ESCAPES[sql[i + 1]!] ?? sql[i + 1]);
          i += 2;
          start = i;
        } else if (c === "'") {
          if (sql[i + 1] === "'") {
            out += sql.slice(start, i) + "'";
            i += 2;
            start = i;
          } else {
            out += sql.slice(start, i);
            i++;
            return out;
          }
        } else i++;
      }
      throw new Error("Unterminated string");
    }
    const m = /^[^,)\s]+/.exec(sql.slice(i, i + 64))!;
    i += m[0].length;
    return m[0].toUpperCase() === "NULL" ? null : m[0];
  };
  const skipStatement = () => {
    // Statements other than INSERT never contain ';' inside strings in this dump.
    const end = sql.indexOf(";", i);
    i = end < 0 ? n : end + 1;
  };

  while (i < n) {
    skipWs();
    if (i >= n) break;
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const head = sql.slice(i, i + 32).toUpperCase();
    if (head.startsWith("USE ")) {
      i += 4;
      const name = readIdent();
      if (!dbs.has(name)) dbs.set(name, new Map());
      current = dbs.get(name);
      skipStatement();
    } else if (head.startsWith("CREATE TABLE")) {
      i += "CREATE TABLE".length;
      const name = readIdent();
      const open = sql.indexOf("(", i);
      // Find the matching close paren of the column list.
      let depth = 0;
      let j = open;
      for (; j < n; j++) {
        if (sql[j] === "(") depth++;
        else if (sql[j] === ")" && --depth === 0) break;
      }
      const body = sql.slice(open + 1, j);
      const columns = [...body.matchAll(/^\s*`([^`]+)`/gm)].map((m) => m[1]!);
      current!.set(name, { name, columns, rows: [] });
      i = j;
      skipStatement();
    } else if (head.startsWith("INSERT INTO")) {
      i += "INSERT INTO".length;
      const name = readIdent();
      const table = current!.get(name)!;
      skipWs();
      // Optional explicit column list is not used by this dump.
      i = sql.indexOf("VALUES", i) + "VALUES".length;
      for (;;) {
        skipWs();
        if (sql[i] !== "(") throw new Error(`Expected ( in ${name} at ${i}`);
        i++;
        const values: (string | null)[] = [];
        for (;;) {
          values.push(readValue());
          skipWs();
          if (sql[i] === ",") { i++; continue; }
          if (sql[i] === ")") { i++; break; }
          throw new Error(`Unexpected ${sql[i]} in ${name} at ${i}`);
        }
        const row: Row = {};
        table.columns.forEach((c, k) => (row[c] = values[k] ?? null));
        table.rows.push(row);
        skipWs();
        if (sql[i] === ",") { i++; continue; }
        if (sql[i] === ";") { i++; break; }
        throw new Error(`Unexpected ${sql[i]} after row in ${name}`);
      }
    } else {
      skipStatement();
    }
  }
  return dbs;
}

export async function loadDump(path: string): Promise<Map<string, Database>> {
  const bytes = await Bun.file(path).arrayBuffer();
  const text = new TextDecoder("windows-1252").decode(bytes);
  return parseDump(text);
}
