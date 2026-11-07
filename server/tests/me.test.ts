import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { prisma } from "../src/lib/prisma.js";
import { STRONG_PASSWORD, createSignedInUser, get, resetDatabase, send, sessionCookie, signIn } from "./helpers.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /api/me", () => {
  it("returns 401 without a session", async () => {
    const response = await get("/api/me");

    expect(response.status).toBe(401);
  });

  it("CA-01.12: creates the profile on the first access after confirmation", async () => {
    const { email, cookie } = await createSignedInUser();
    expect(await prisma.profile.count({ where: { user: { email } } })).toBe(0);

    const response = await get("/api/me", { cookie });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.email).toBe(email);
    expect(body.profile.firstName).toBeNull();
    expect(body.profile.lastName).toBeNull();
    expect(body.company).toBeNull();
    expect(await prisma.profile.count({ where: { user: { email } } })).toBe(1);
  });

  it("CA-01.12: does not create a second profile on later accesses", async () => {
    const { email, cookie } = await createSignedInUser();

    await get("/api/me", { cookie });
    await get("/api/me", { cookie });

    expect(await prisma.profile.count({ where: { user: { email } } })).toBe(1);
  });

  it("enables the personal profile for PERSONAL accounts", async () => {
    const { cookie } = await createSignedInUser({ usageType: "PERSONAL" });

    const body = await (await get("/api/me", { cookie })).json();

    expect(body.profile.personalEnabled).toBe(true);
  });

  it("disables the personal profile for COMPANY accounts", async () => {
    const { cookie } = await createSignedInUser({ usageType: "COMPANY" });

    const body = await (await get("/api/me", { cookie })).json();

    expect(body.profile.personalEnabled).toBe(false);
  });
});

describe("PATCH /api/me", () => {
  it.each([
    ["an empty first name", { firstName: "", lastName: "Popescu" }],
    ["an empty last name", { firstName: "Ana", lastName: "" }],
    ["only spaces", { firstName: "   ", lastName: "   " }],
    ["a missing body", {}],
    ["a name that is too long", { firstName: "A".repeat(51), lastName: "Popescu" }],
  ])("CA-01.17: rejects %s", async (_reason, body) => {
    const { cookie } = await createSignedInUser();

    const response = await send("PATCH", "/api/me", body, { cookie });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_NAME");
  });

  it("CA-01.17: saves the first and last name, trimmed", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send("PATCH", "/api/me", { firstName: "  Ana ", lastName: " Popescu " }, { cookie });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.profile.firstName).toBe("Ana");
    expect(body.profile.lastName).toBe("Popescu");
  });

  it("CA-01.19: the saved name is returned on another device", async () => {
    const { email, cookie } = await createSignedInUser();
    await send("PATCH", "/api/me", { firstName: "Ana", lastName: "Popescu" }, { cookie });

    const otherDevice = sessionCookie(await signIn(email, STRONG_PASSWORD));
    const body = await (await get("/api/me", { cookie: otherDevice })).json();

    expect(body.profile.firstName).toBe("Ana");
    expect(body.profile.lastName).toBe("Popescu");
  });

  it("CA-01.17: rejects a request body that is not valid JSON", async () => {
    const { cookie } = await createSignedInUser();

    const response = await app.request("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{not json",
    });

    expect(response.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    const response = await send("PATCH", "/api/me", { firstName: "Ana", lastName: "Popescu" });

    expect(response.status).toBe(401);
  });
});

describe("POST /api/me/personal", () => {
  it("enables the personal profile for a COMPANY account", async () => {
    const { cookie } = await createSignedInUser({ usageType: "COMPANY" });
    await get("/api/me", { cookie });

    const response = await send("POST", "/api/me/personal", {}, { cookie });

    expect(response.status).toBe(200);
    expect((await response.json()).profile.personalEnabled).toBe(true);
  });
});
