import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DROPBOX_TOKEN_KEY = "dropbox_access_token";
const SUMUP_IMPORT_PATH_KEY = "sumup_import_path";
const SUMUP_EXPORT_PATH_KEY = "sumup_export_path";

async function getSetting(key: string): Promise<string | null> {
  const row = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
  return row.length > 0 ? row[0].value : null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: new Date() } });
}

router.get("/settings/dropbox-token", async (_req, res) => {
  try {
    const token = await getSetting(DROPBOX_TOKEN_KEY);
    if (!token) return res.json({ set: false });
    const masked = token.length > 8 ? token.slice(0, 4) + "••••••••" + token.slice(-4) : "••••••••";
    res.json({ set: true, masked });
  } catch {
    res.status(500).json({ error: "Failed to read token" });
  }
});

router.put("/settings/dropbox-token", async (req, res) => {
  try {
    const { token } = req.body as { token?: string };
    if (token === undefined) return res.status(400).json({ error: "token required" });
    if (token === "") {
      await db.delete(settingsTable).where(eq(settingsTable.key, DROPBOX_TOKEN_KEY));
      return res.json({ ok: true, set: false });
    }
    await setSetting(DROPBOX_TOKEN_KEY, token);
    res.json({ ok: true, set: true });
  } catch {
    res.status(500).json({ error: "Failed to save token" });
  }
});

router.get("/settings/sumup-paths", async (_req, res) => {
  try {
    const importPath = (await getSetting(SUMUP_IMPORT_PATH_KEY)) ?? "/Apps/roc.kasse";
    const exportPath = (await getSetting(SUMUP_EXPORT_PATH_KEY)) ?? "/Apps/roc.kasse";
    res.json({ importPath, exportPath });
  } catch {
    res.status(500).json({ error: "Failed to read paths" });
  }
});

router.put("/settings/sumup-paths", async (req, res) => {
  try {
    const { importPath, exportPath } = req.body as { importPath?: string; exportPath?: string };
    if (importPath !== undefined) await setSetting(SUMUP_IMPORT_PATH_KEY, importPath.trim() || "/Apps/roc.kasse");
    if (exportPath !== undefined) await setSetting(SUMUP_EXPORT_PATH_KEY, exportPath.trim() || "/Apps/roc.kasse");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save paths" });
  }
});

export { DROPBOX_TOKEN_KEY, SUMUP_IMPORT_PATH_KEY, SUMUP_EXPORT_PATH_KEY, getSetting };
export default router;
