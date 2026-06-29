import { Router } from "express";
import { db } from "@workspace/db";
import { vouchersTable } from "@workspace/db";
import { eq, ilike, inArray, sql } from "drizzle-orm";

const router = Router();

router.get("/vouchers", async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    let vouchers;
    if (search && search.trim()) {
      vouchers = await db
        .select()
        .from(vouchersTable)
        .where(ilike(vouchersTable.gutscheinnummer, `%${search}%`))
        .orderBy(vouchersTable.id);
    } else {
      vouchers = await db
        .select()
        .from(vouchersTable)
        .orderBy(vouchersTable.id);
    }
    const mapped = vouchers.map((v) => ({
      ...v,
      betrag: Number(v.betrag),
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to list vouchers" });
  }
});

router.get("/vouchers/stats", async (req, res) => {
  try {
    const rows = await db.select().from(vouchersTable);
    const total = rows.length;
    const totalBetrag = rows.reduce((sum, v) => sum + Number(v.betrag), 0);
    const redeemedCount = rows.filter((v) => v.einloesung1).length;
    const unredeemed = total - redeemedCount;
    res.json({ total, totalBetrag, redeemedCount, unredeemed });
  } catch (err) {
    res.status(500).json({ error: "Failed to get stats" });
  }
});

router.get("/vouchers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(vouchersTable)
      .where(eq(vouchersTable.id, id));
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const v = rows[0];
    res.json({
      ...v,
      betrag: Number(v.betrag),
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get voucher" });
  }
});

router.post("/vouchers", async (req, res) => {
  try {
    const { gutscheinnummer, betrag, key, ausstellungsdatum, einloesung1, einloesung2, einloesung3 } = req.body;
    if (!gutscheinnummer || betrag == null || !key) {
      return res.status(400).json({ error: "gutscheinnummer, betrag, and key are required" });
    }
    const rows = await db
      .insert(vouchersTable)
      .values({
        gutscheinnummer: String(gutscheinnummer),
        betrag: String(betrag),
        key: String(key),
        ausstellungsdatum: ausstellungsdatum || null,
        einloesung1: einloesung1 || null,
        einloesung2: einloesung2 || null,
        einloesung3: einloesung3 || null,
      })
      .returning();
    const v = rows[0];
    res.status(201).json({
      ...v,
      betrag: Number(v.betrag),
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create voucher" });
  }
});

router.patch("/vouchers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { gutscheinnummer, betrag, key, ausstellungsdatum, einloesung1, einloesung2, einloesung3 } = req.body;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (gutscheinnummer !== undefined) updateData.gutscheinnummer = String(gutscheinnummer);
    if (betrag !== undefined) updateData.betrag = String(betrag);
    if (key !== undefined) updateData.key = String(key);
    if (ausstellungsdatum !== undefined) updateData.ausstellungsdatum = ausstellungsdatum || null;
    if (einloesung1 !== undefined) updateData.einloesung1 = einloesung1 || null;
    if (einloesung2 !== undefined) updateData.einloesung2 = einloesung2 || null;
    if (einloesung3 !== undefined) updateData.einloesung3 = einloesung3 || null;

    const rows = await db
      .update(vouchersTable)
      .set(updateData)
      .where(eq(vouchersTable.id, id))
      .returning();
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    const v = rows[0];
    res.json({
      ...v,
      betrag: Number(v.betrag),
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update voucher" });
  }
});

router.delete("/vouchers", async (req, res) => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }
    await db.delete(vouchersTable).where(inArray(vouchersTable.id, ids));
    res.json({ deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to bulk delete vouchers" });
  }
});

router.delete("/vouchers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(vouchersTable).where(eq(vouchersTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete voucher" });
  }
});

export default router;
