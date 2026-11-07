import { createMiddleware } from "hono/factory";
import { auth } from "./auth.js";

export type SessionVariables = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
};

export const requireSession = createMiddleware<{ Variables: SessionVariables }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ code: "UNAUTHORIZED" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});
