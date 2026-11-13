import { describe, expect, it } from "vitest";
import { isStrongPassword, passwordRules } from "../src/password-rules.js";

function ruleResults(password: string) {
  return Object.fromEntries(passwordRules.map((rule) => [rule.id, rule.test(password)]));
}

describe("passwordRules", () => {
  it("CA-01.1: has the three rules with the required labels", () => {
    expect(passwordRules.map((rule) => rule.label)).toEqual([
      "Cel puțin 8 caractere",
      "Cel puțin o cifră",
      "Cel puțin o literă mare",
    ]);
  });

  it("checks the minimum length of 8 characters", () => {
    expect(ruleResults("Abc1234").length).toBe(false);
    expect(ruleResults("Abc12345").length).toBe(true);
  });

  it("checks for at least one digit", () => {
    expect(ruleResults("Abcdefgh").digit).toBe(false);
    expect(ruleResults("Abcdefg1").digit).toBe(true);
  });

  it("checks for at least one uppercase letter, including Romanian letters", () => {
    expect(ruleResults("abcdefg1").uppercase).toBe(false);
    expect(ruleResults("Abcdefg1").uppercase).toBe(true);
    expect(ruleResults("Șabcdef1").uppercase).toBe(true);
  });
});

describe("isStrongPassword", () => {
  it("accepts a password that meets all rules", () => {
    expect(isStrongPassword("Parola123")).toBe(true);
  });

  it.each([
    ["too short", "Pa1"],
    ["no digit", "Parolaaa"],
    ["no uppercase letter", "parola123"],
    ["empty", ""],
  ])("rejects a password that is %s", (_reason, password) => {
    expect(isStrongPassword(password)).toBe(false);
  });
});
