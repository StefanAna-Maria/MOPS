import "dotenv/config";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import app from "./index.js";

// In development, log every request with its status and duration (tests use `app` directly, without this log).
const devApp = new Hono();
devApp.use(logger());
devApp.route("/", app);

serve({ fetch: devApp.fetch, port: 3000 }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});
