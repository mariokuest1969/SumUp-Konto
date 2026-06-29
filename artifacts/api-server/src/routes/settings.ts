import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DROPBOX_TOKEN_KEY = "dropbox_access_token";

router.get("/settings/dropbox-token", async (_req, res) => {
  try {
    const row = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, DROPBOX_TOKEN_KEY))
      .limit(1);
    if (row.length === 0) {
      return res.json({ set: false });
    }
    const token = row[0].value;
    const masked = token.length > 8
      ? token.slice(0, 4) + "••••••••" + token.slice(-4)
      : "••••••••";
    res.json({ set: true, masked });
  } catch (err) {
    res.status(500).json({ error: "Failed to read token" });
  }
});

router.put("/settings/dropbox-token", async (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (token === undefined) {
      return res.status(400).json({ error: "token required" });
    }
    if (token === "") {
      await db.delete(settingsTable).where(eq(settingsTable.key, DROPBOX_TOKEN_KEY));
      return res.json({ ok: true, set: false });
    }
    await db
      .insert(settingsTable)
      .values({ key: DROPBOX_TOKEN_KEY, value: token })
      .onConflictDoUpdate({
        target: settingsTable.key,
        set: { value: token, updatedAt: new Date() },
      });
    res.json({ ok: true, set: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save token" });
  }
});

export { DROPBOX_TOKEN_KEY };
export default router;
