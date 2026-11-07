import { Hono } from "hono";
import { auth } from "./lib/auth.js";
import { prisma } from "./lib/prisma.js";
import me from "./routes/me.js";
import company from "./routes/company.js";

const app = new Hono();

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/me", me);
app.route("/api/company", company);

app.get("/api/health", async (c) => {
  await prisma.$queryRaw`SELECT 1`;
  return c.json({ status: "ok" });
});

export default app;
