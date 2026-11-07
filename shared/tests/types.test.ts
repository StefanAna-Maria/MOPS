import { describe, expect, it } from "vitest";
import { USAGE_TYPES, isUsageType } from "../src/types.js";

describe("isUsageType", () => {
  it("accepts every known usage type", () => {
    for (const usageType of USAGE_TYPES) {
      expect(isUsageType(usageType)).toBe(true);
    }
  });

  it.each(["ADMIN", "personal", "", null, undefined, 1])("rejects %s", (value) => {
    expect(isUsageType(value)).toBe(false);
  });
});
