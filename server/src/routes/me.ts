import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { deleteAccount } from "../lib/delete-account.js";
import { requireSession, type SessionVariables } from "../lib/session.js";

const me = new Hono<{ Variables: SessionVariables }>();

me.use("*", requireSession);

me.get("/", async (c) => {
  const user = c.get("user");
  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      personalEnabled: user.usageType !== "COMPANY",
    },
  });
  const company = await prisma.company.findUnique({ where: { ownerId: user.id } });
  return c.json({
    user: { id: user.id, email: user.email, usageType: user.usageType },
    profile,
    company,
  });
});

me.patch("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  if (!firstName || !lastName || firstName.length > 50 || lastName.length > 50) {
    return c.json({ code: "INVALID_NAME" }, 400);
  }
  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: { firstName, lastName },
    create: {
      userId: user.id,
      firstName,
      lastName,
      personalEnabled: user.usageType !== "COMPANY",
    },
  });
  return c.json({ profile });
});

// US-12: deletes the signed-in user's own account with everything it holds. The app asks for confirmation first.
me.delete("/", async (c) => {
  await deleteAccount(c.get("user"));
  return c.body(null, 204);
});

me.post("/personal", async (c) => {
  const user = c.get("user");
  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    update: { personalEnabled: true },
    create: { userId: user.id, personalEnabled: true },
  });
  return c.json({ profile });
});

export default me;
