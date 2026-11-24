import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { createSignedInUser, get, resetDatabase, send } from "./helpers.js";

function remove(path: string, cookie?: string) {
  return app.request(path, {
    method: "DELETE",
    headers: { Origin: "http://localhost:3000", ...(cookie ? { Cookie: cookie } : {}) },
  });
}

async function names(cookie: string) {
  const body = await (await get("/api/categories", { cookie })).json();
  return body.categories.map((category: { name: string }) => category.name);
}

async function create(cookie: string, name: string) {
  return send("POST", "/api/categories", { name }, { cookie });
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date());
}

function addExpense(cookie: string, category: string) {
  return send(
    "POST",
    "/api/documents/manual",
    { clientRequestId: randomUUID(), description: "Abonament sală", amount: "150", date: todayIso(), category },
    { cookie },
  );
}

beforeEach(async () => {
  await resetDatabase();
});

describe("US-03: categories", () => {
  it("returns 401 without a session", async () => {
    expect((await get("/api/categories")).status).toBe(401);
  });

  it("offers the 9 built-in categories, with Altele last", async () => {
    const { cookie } = await createSignedInUser();

    const list = await names(cookie);

    expect(list).toHaveLength(9);
    expect(list[0]).toBe("Alimente");
    expect(list.at(-1)).toBe("Altele");
  });

  it("adds a category of my own, offered before Altele", async () => {
    const { cookie } = await createSignedInUser();

    const response = await create(cookie, "  Sală   de sport ");

    expect(response.status).toBe(201);
    const { category } = await response.json();
    expect(category).toMatchObject({ name: "Sală de sport", builtIn: false });
    expect((await names(cookie)).slice(-2)).toEqual(["Sală de sport", "Altele"]);
  });

  it.each([
    ["an empty name", "   ", 400, "INVALID_CATEGORY_NAME"],
    ["a name over 30 characters", "x".repeat(31), 400, "INVALID_CATEGORY_NAME"],
    ["the name of a built-in category (any case)", "alimente", 409, "CATEGORY_EXISTS"],
  ])("refuses %s", async (_case, name, status, code) => {
    const { cookie } = await createSignedInUser();

    const response = await create(cookie, name);

    expect(response.status).toBe(status);
    expect((await response.json()).code).toBe(code);
  });

  it("refuses a second category with the same name, ignoring case and diacritics", async () => {
    const { cookie } = await createSignedInUser();
    await create(cookie, "Sală");

    const response = await create(cookie, "SALA");

    expect(response.status).toBe(409);
  });

  it("deletes a category of my own that no expense uses", async () => {
    const { cookie } = await createSignedInUser();
    const { category } = await (await create(cookie, "Cadouri")).json();

    expect((await remove(`/api/categories/${category.id}`, cookie)).status).toBe(204);
    expect(await names(cookie)).not.toContain("Cadouri");
  });

  it("hides a built-in category I do not use, and brings it back when I add it again", async () => {
    const { cookie } = await createSignedInUser();

    expect((await remove("/api/categories/EDUCATION", cookie)).status).toBe(204);
    expect(await names(cookie)).not.toContain("Educație");

    const again = await create(cookie, "educatie");
    expect(again.status).toBe(201);
    expect((await again.json()).category).toEqual({ id: "EDUCATION", name: "Educație", builtIn: true });
    expect(await names(cookie)).toContain("Educație");
  });

  it("does not delete a category an expense uses, and says how many use it", async () => {
    const { cookie } = await createSignedInUser();
    const { category } = await (await create(cookie, "Sală")).json();
    await addExpense(cookie, category.id);
    await addExpense(cookie, "TRANSPORT");

    const own = await remove(`/api/categories/${category.id}`, cookie);
    const builtIn = await remove("/api/categories/TRANSPORT", cookie);

    expect(own.status).toBe(409);
    expect(await own.json()).toEqual({ code: "CATEGORY_IN_USE", count: 1 });
    expect(builtIn.status).toBe(409);
  });

  it("never deletes Altele, the default category", async () => {
    const { cookie } = await createSignedInUser();

    const response = await remove("/api/categories/OTHER", cookie);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("CATEGORY_REQUIRED");
  });

  it("does not let me see, use or delete another user's category", async () => {
    const owner = await createSignedInUser();
    const { category } = await (await create(owner.cookie, "Secretă")).json();
    const other = await createSignedInUser();

    expect(await names(other.cookie)).not.toContain("Secretă");
    expect((await remove(`/api/categories/${category.id}`, other.cookie)).status).toBe(404);
    const expense = await addExpense(other.cookie, category.id);
    expect(expense.status).toBe(400);
    expect((await expense.json()).fields).toEqual(["category"]);
  });

  it("saves a manual expense in a category of my own and shows its name on Acasă and in the detail", async () => {
    const { cookie } = await createSignedInUser();
    const { category } = await (await create(cookie, "Sală de sport")).json();

    const saved = await addExpense(cookie, category.id);

    expect(saved.status).toBe(201);
    const { document } = await saved.json();
    expect(document).toMatchObject({ category: category.id, categoryName: "Sală de sport" });
    const list = await (await get("/api/documents", { cookie })).json();
    expect(list.documents[0].categoryName).toBe("Sală de sport");
    const detail = await (await get(`/api/documents/${document.id}`, { cookie })).json();
    expect(detail.document.categoryName).toBe("Sală de sport");
  });

  it("names built-in categories from their code", async () => {
    const { cookie } = await createSignedInUser();

    const { document } = await (await addExpense(cookie, "GROCERIES")).json();

    expect(document.categoryName).toBe("Alimente");
  });
});

describe("US-03: category order", () => {
  function putOrder(cookie: string, order: unknown) {
    return app.request("/api/categories/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", Cookie: cookie },
      body: JSON.stringify({ order }),
    });
  }

  async function ids(cookie: string): Promise<string[]> {
    const body = await (await get("/api/categories", { cookie })).json();
    return body.categories.map((category: { id: string }) => category.id);
  }

  it("keeps the order I chose", async () => {
    const { cookie } = await createSignedInUser();
    const { category } = await (await create(cookie, "Sală")).json();
    const current = await ids(cookie);
    const mine = [category.id, "OTHER", ...current.filter((id) => id !== category.id && id !== "OTHER")];

    const response = await putOrder(cookie, mine);

    expect(response.status).toBe(200);
    expect((await response.json()).categories.map((c: { id: string }) => c.id)).toEqual(mine);
    expect(await ids(cookie)).toEqual(mine);
  });

  it("puts a category added after I ordered them just before Altele", async () => {
    const { cookie } = await createSignedInUser();
    const reversed = (await ids(cookie)).reverse(); // Altele first now
    await putOrder(cookie, [...reversed.slice(1), "OTHER"]);

    const { category } = await (await create(cookie, "Cadouri")).json();

    expect((await ids(cookie)).slice(-2)).toEqual([category.id, "OTHER"]);
  });

  it.each([
    ["a category is missing", (current: string[]) => current.slice(1)],
    ["a category appears twice", (current: string[]) => [...current.slice(1), current[1]]],
    ["an unknown category is added", (current: string[]) => [...current.slice(1), "cmwnotmine000000000000001"]],
    ["it is not a list", () => "GROCERIES"],
  ])("refuses an order where %s", async (_case, make) => {
    const { cookie } = await createSignedInUser();

    const response = await putOrder(cookie, make(await ids(cookie)));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_ORDER");
  });

  it("keeps the order of the others after a category is removed", async () => {
    const { cookie } = await createSignedInUser();
    const reversed = (await ids(cookie)).reverse();
    await putOrder(cookie, reversed);

    await remove("/api/categories/EDUCATION", cookie);

    expect(await ids(cookie)).toEqual(reversed.filter((id) => id !== "EDUCATION"));
  });
});
