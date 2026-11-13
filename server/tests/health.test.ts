import { describe, expect, it } from "vitest";
import app from "../src/index.js";

describe("GET /api/health", () => {
  it("answers ok when the database is reachable", async () => {
    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
