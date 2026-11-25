/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * US-17: every text the user sees lives in src/i18n (ro.ts and en.ts), so the app can be shown in English.
 * A Romanian text written straight into a screen would stay Romanian in English: this test finds them by their
 * Romanian letters (ă, â, î, ș, ț) in string literals outside src/i18n. Comments are ignored.
 */
const SRC = path.join(__dirname, "..", "src");
const ROMANIAN = /[ăâîșțĂÂÎȘȚ]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "i18n" ? [] : files(full);
    }
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

function romanianTexts(file: string) {
  const source = withoutComments(readFileSync(file, "utf8"));
  const literals = source.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`|>[^<>{}\n]+</g) ?? [];
  return literals.filter((literal) => ROMANIAN.test(literal));
}

describe("US-17: texts are in src/i18n", () => {
  it("no screen or component writes a Romanian text directly", () => {
    const found = files(SRC)
      .map((file) => ({ file: path.relative(SRC, file), texts: romanianTexts(file) }))
      .filter((entry) => entry.texts.length > 0);

    expect(found).toEqual([]);
  });
});
