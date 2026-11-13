import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { requireSession, type SessionVariables } from "../lib/session.js";
import { isValidCui, normalizeCui } from "@ocrinvoice/shared";

const company = new Hono<{ Variables: SessionVariables }>();

company.use("*", requireSession);

company.get("/", async (c) => {
  const user = c.get("user");
  const existing = await prisma.company.findUnique({ where: { ownerId: user.id } });
  return c.json({ company: existing });
});

company.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const cui = typeof body?.cui === "string" ? normalizeCui(body.cui) : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const registrationNumber =
    typeof body?.registrationNumber === "string" && body.registrationNumber.trim()
      ? body.registrationNumber.trim()
      : null;
  const vatPayer = body?.vatPayer === true;

  if (!isValidCui(cui)) {
    return c.json({ code: "INVALID_CUI" }, 400);
  }
  if (!name || name.length > 200 || !address || address.length > 300) {
    return c.json({ code: "INVALID_COMPANY" }, 400);
  }
  if (registrationNumber && registrationNumber.length > 30) {
    return c.json({ code: "INVALID_COMPANY" }, 400);
  }

  const existing = await prisma.company.findUnique({ where: { ownerId: user.id } });
  if (existing) {
    return c.json({ code: "COMPANY_ALREADY_EXISTS" }, 409);
  }

  const created = await prisma.company.create({
    data: {
      ownerId: user.id,
      cui,
      name,
      address,
      registrationNumber,
      vatPayer,
    },
  });
  return c.json({ company: created }, 201);
});

export default company;
