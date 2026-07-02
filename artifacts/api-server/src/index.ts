import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function seedDropboxToken() {
  const token = process.env["DROPBOX_ACCESS_TOKEN"];
  if (!token) return;
  try {
    const existing = await db.select().from(settingsTable).where(eq(settingsTable.key, "dropbox_access_token")).limit(1);
    if (existing.length === 0) {
      await db.insert(settingsTable).values({ key: "dropbox_access_token", value: token });
      logger.info("Dropbox token seeded from environment variable");
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed Dropbox token");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  seedDropboxToken();
});
