import { describe, expect, it } from "vitest";
import { isValidCui, normalizeCui } from "../src/cui.js";

describe("normalizeCui", () => {
  it("removes spaces", () => {
    expect(normalizeCui(" 1439 9840 ")).toBe("14399840");
  });

  it("removes the RO prefix in any letter case", () => {
    expect(normalizeCui("RO14399840")).toBe("14399840");
    expect(normalizeCui("ro14399840")).toBe("14399840");
    expect(normalizeCui("Ro 14399840")).toBe("14399840");
  });

  it("keeps a CUI without prefix unchanged", () => {
    expect(normalizeCui("14399840")).toBe("14399840");
  });
});

describe("isValidCui", () => {
  it.each(["14399840", "RO14399840", "ro 14399840", "12345674"])("accepts the valid CUI %s", (cui) => {
    expect(isValidCui(cui)).toBe(true);
  });

  it("rejects a CUI with a wrong control digit", () => {
    expect(isValidCui("14399841")).toBe(false);
    expect(isValidCui("12345675")).toBe(false);
  });

  it("rejects values that are too short or too long", () => {
    expect(isValidCui("1")).toBe(false);
    expect(isValidCui("12345678901")).toBe(false);
  });

  it("rejects values that contain other characters", () => {
    expect(isValidCui("12A45678")).toBe(false);
    expect(isValidCui("1439-9840")).toBe(false);
    expect(isValidCui("RO")).toBe(false);
  });

  it("rejects an empty value", () => {
    expect(isValidCui("")).toBe(false);
    expect(isValidCui("   ")).toBe(false);
  });

  it("treats a control result of 10 as control digit 0", () => {
    const base = "1008";
    const key = "753217532";
    const padded = base.padStart(9, "0");
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += Number(padded[i]) * Number(key[i]);
    }
    expect((sum * 10) % 11).toBe(10);
    expect(isValidCui(`${base}0`)).toBe(true);
    expect(isValidCui(`${base}1`)).toBe(false);
  });
});
