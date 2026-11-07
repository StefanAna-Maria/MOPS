import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("sign-out", () => {
  it("CA-01.14: closes the session on the server", async () => {
    const { email, cookie } = await createSignedInUser();
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(1);

    const response = await send("POST", "/api/auth/sign-out", {}, { cookie });

    expect(response.status).toBe(200);
    expect(await prisma.session.count({ where: { user: { email } } })).toBe(0);
  });

  it("CA-01.16: a request with the old session gets 401 after sign-out", async () => {
    const { cookie } = await createSignedInUser();
    expect((await get("/api/me", { cookie })).status).toBe(200);

    await send("POST", "/api/auth/sign-out", {}, { cookie });
    const response = await get("/api/me", { cookie });

    expect(response.status).toBe(401);
  });

  it("closes only the session of the device that signs out", async () => {
    const first = await createSignedInUser();
    const secondSignIn = await send(
      "POST",
      "/api/auth/sign-in/email",
      { email: first.email, password: "Parola123" },
    );
    const secondCookie = secondSignIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");

    await send("POST", "/api/auth/sign-out", {}, { cookie: first.cookie });

    expect((await get("/api/me", { cookie: first.cookie })).status).toBe(401);
    expect((await get("/api/me", { cookie: secondCookie })).status).toBe(200);
  });
});
