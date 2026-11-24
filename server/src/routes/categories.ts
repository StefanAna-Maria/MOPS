import { Hono } from "hono";
import {
  CATEGORY_NAME_MAX_LENGTH,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
} from "@ocrinvoice/shared";
import { prisma } from "../lib/prisma.js";
import { requireSession, type SessionVariables } from "../lib/session.js";
import { DEFAULT_CATEGORY, countDocumentsUsing, listCategories } from "../lib/categories.js";

/**
 * US-03: the user's categories. Besides the 9 built-in ones, a user can add their own, and remove the ones they do not
 * use: their own are deleted, built-in ones are hidden. A category used by an expense cannot be removed, and
 * "Altele" (the default) can never be.
 */
const categories = new Hono<{ Variables: SessionVariables }>();

categories.use("*", requireSession);

/** "Sală", "SALA" and "sala" are the same name (Romanian collation treats ă as its own letter, so strip diacritics). */
const normalized = (name: string) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const sameName = (a: string, b: string) => normalized(a) === normalized(b);

categories.get("/", async (c) => {
  const user = c.get("user");
  return c.json({ categories: await listCategories(user.id) });
});

categories.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > CATEGORY_NAME_MAX_LENGTH) {
    return c.json({ code: "INVALID_CATEGORY_NAME" }, 400);
  }

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, personalEnabled: user.usageType !== "COMPANY" },
    select: { hiddenCategories: true },
  });

  // A built-in category with that name: offer it again if it was hidden, otherwise it already exists.
  const builtIn = EXPENSE_CATEGORIES.find((code) => sameName(EXPENSE_CATEGORY_LABELS[code], name));
  if (builtIn) {
    if (!profile.hiddenCategories.includes(builtIn)) {
      return c.json({ code: "CATEGORY_EXISTS" }, 409);
    }
    await prisma.profile.update({
      where: { userId: user.id },
      data: { hiddenCategories: profile.hiddenCategories.filter((code) => code !== builtIn) },
    });
    return c.json({ category: { id: builtIn, name: EXPENSE_CATEGORY_LABELS[builtIn], builtIn: true } }, 201);
  }

  const own = await prisma.category.findMany({ where: { userId: user.id }, select: { name: true } });
  if (own.some((row) => sameName(row.name, name))) {
    return c.json({ code: "CATEGORY_EXISTS" }, 409);
  }
  const created = await prisma.category.create({ data: { userId: user.id, name } });
  return c.json({ category: { id: created.id, name: created.name, builtIn: false } }, 201);
});

// US-03: saves the order the user put their categories in. It must list exactly the categories they have, once each.
categories.put("/order", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const order: unknown = body?.order;
  const current = (await listCategories(user.id)).map((category) => category.id);
  const valid =
    Array.isArray(order) &&
    order.every((id) => typeof id === "string") &&
    order.length === current.length &&
    new Set(order).size === order.length &&
    current.every((id) => order.includes(id));
  if (!valid) {
    return c.json({ code: "INVALID_ORDER" }, 400);
  }
  await prisma.profile.upsert({
    where: { userId: user.id },
    update: { categoryOrder: order as string[] },
    create: { userId: user.id, personalEnabled: user.usageType !== "COMPANY", categoryOrder: order as string[] },
  });
  return c.json({ categories: await listCategories(user.id) });
});

categories.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (id === DEFAULT_CATEGORY) {
    return c.json({ code: "CATEGORY_REQUIRED" }, 400);
  }

  const isBuiltIn = isExpenseCategory(id);
  if (!isBuiltIn && (await prisma.category.count({ where: { id, userId: user.id } })) === 0) {
    return c.json({ code: "CATEGORY_NOT_FOUND" }, 404);
  }

  const used = await countDocumentsUsing(user.id, id);
  if (used > 0) {
    return c.json({ code: "CATEGORY_IN_USE", count: used }, 409);
  }

  if (isBuiltIn) {
    const profile = await prisma.profile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, personalEnabled: user.usageType !== "COMPANY" },
      select: { hiddenCategories: true },
    });
    if (!profile.hiddenCategories.includes(id)) {
      await prisma.profile.update({
        where: { userId: user.id },
        data: { hiddenCategories: [...profile.hiddenCategories, id] },
      });
    }
  } else {
    await prisma.category.delete({ where: { id } });
  }
  return c.body(null, 204);
});

export default categories;
