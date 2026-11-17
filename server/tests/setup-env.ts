import { config } from "dotenv";

config({ path: ".env.test", override: true, quiet: true });

// US-09: uploaded photos from tests go to a temporary folder, never to server/uploads.
process.env.UPLOAD_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? "/tmp"}/mops-test-uploads`;
