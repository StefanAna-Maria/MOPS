import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

const validCompany = {
  cui: "RO 14399840",
  name: "Exemplu SRL",
  address: "Str. Exemplu nr. 1, București",
};

beforeEach(async () => {
  await resetDatabase();
});

describe("company", () => {
  it("returns 401 without a session", async () => {
    expect((await get("/api/company")).status).toBe(401);
    expect((await send("POST", "/api/company", validCompany)).status).toBe(401);
  });

  it("saves a valid company with the CUI normalized", async () => {
    const { cookie } = await createSignedInUser({ usageType: "COMPANY" });

    const response = await send("POST", "/api/company", { ...validCompany, vatPayer: true }, { cookie });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.company.cui).toBe("14399840");
    expect(body.company.name).toBe("Exemplu SRL");
    expect(body.company.registrationNumber).toBeNull();
    expect(body.company.vatPayer).toBe(true);
  });

  it("uses false for VAT payer when it is not sent", async () => {
    const { cookie } = await createSignedInUser();

    const body = await (await send("POST", "/api/company", validCompany, { cookie })).json();

    expect(body.company.vatPayer).toBe(false);
  });

  it("rejects a CUI with a wrong control digit", async () => {
    const { cookie } = await createSignedInUser();

    const response = await send("POST", "/api/company", { ...validCompany, cui: "14399841" }, { cookie });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_CUI");
  });

  it.each([
    ["the name is missing", { ...validCompany, name: "" }],
    ["the address is missing", { ...validCompany, address: "  " }],
    ["the registration number is too long", { ...validCompany, registrationNumber: "J".repeat(31) }],
  ])("rejects the company when %s", async (_reason, company) => {
    const { cookie } = await createSignedInUser();

    const response = await send("POST", "/api/company", company, { cookie });

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_COMPANY");
  });

  it("rejects a request body that is not valid JSON", async () => {
    const { cookie } = await createSignedInUser();

    const response = await app.request("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{not json",
    });

    expect(response.status).toBe(400);
  });

  it("allows only one company per account", async () => {
    const { cookie } = await createSignedInUser();
    await send("POST", "/api/company", validCompany, { cookie });

    const response = await send("POST", "/api/company", { ...validCompany, name: "Alta SRL" }, { cookie });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("COMPANY_ALREADY_EXISTS");
  });

  it("returns the company in GET /api/company and GET /api/me", async () => {
    const { cookie } = await createSignedInUser();
    await send("POST", "/api/company", validCompany, { cookie });

    const company = await (await get("/api/company", { cookie })).json();
    const me = await (await get("/api/me", { cookie })).json();

    expect(company.company.name).toBe("Exemplu SRL");
    expect(me.company.name).toBe("Exemplu SRL");
  });

  it("does not show one user's company to another user", async () => {
    const owner = await createSignedInUser();
    await send("POST", "/api/company", validCompany, { cookie: owner.cookie });
    const other = await createSignedInUser();

    const body = await (await get("/api/company", { cookie: other.cookie })).json();

    expect(body.company).toBeNull();
  });
});
