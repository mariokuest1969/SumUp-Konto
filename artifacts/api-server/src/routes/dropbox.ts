import { Router } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { vouchersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function vouchersToCSV(vouchers: typeof vouchersTable.$inferSelect[]): string {
  const header = "Gutscheinnummer;Betrag;Key;Ausstellungsdatum;Einloesung1;Einloesung2;Einloesung3";
  const rows = vouchers.map((v) =>
    [
      v.gutscheinnummer,
      Number(v.betrag).toFixed(2).replace(".", ","),
      v.key,
      v.ausstellungsdatum ?? "",
      v.einloesung1 ?? "",
      v.einloesung2 ?? "",
      v.einloesung3 ?? "",
    ].join(";")
  );
  return [header, ...rows].join("\n");
}

function generateFilename(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `Voucher ${day}.${month}.${year}.csv`;
}

async function uploadToDropbox(connectors: ReplitConnectors, path: string, content: string): Promise<void> {
  // Step 1: Get a temporary upload link via the metadata API (api.dropboxapi.com)
  const linkRes = await connectors.proxy("dropbox", "/2/files/get_temporary_upload_link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commit_info: { path, mode: "overwrite", autorename: false, mute: false },
      duration: 14400,
    }),
  });
  if (!linkRes.ok) {
    const text = await linkRes.text();
    throw new Error(`Dropbox get_temporary_upload_link failed: ${linkRes.status} ${text.substring(0, 200)}`);
  }
  const { link } = await linkRes.json() as { link: string };

  // Step 2: Upload directly to the temp link — no auth header needed (it's in the URL)
  const uploadRes = await fetch(link, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.from(content, "utf-8"),
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Dropbox temp upload failed: ${uploadRes.status} ${text.substring(0, 200)}`);
  }
}

async function downloadFromDropbox(connectors: ReplitConnectors, path: string): Promise<string> {
  // Get a temporary download link via the metadata API (api.dropboxapi.com)
  const linkRes = await connectors.proxy("dropbox", "/2/files/get_temporary_link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!linkRes.ok) {
    const text = await linkRes.text();
    throw new Error(`Dropbox get_temporary_link failed: ${linkRes.status} ${text.substring(0, 300)}`);
  }
  const { link } = await linkRes.json() as { link: string };
  // Download directly via the temp link — no auth needed
  const dlRes = await fetch(link);
  if (!dlRes.ok) {
    throw new Error(`Dropbox temp download failed: ${dlRes.status}`);
  }
  return dlRes.text();
}

router.get("/dropbox/list", async (req, res) => {
  try {
    const connectors = new ReplitConnectors();
    const path = (req.query.path as string) || "";
    const response = await connectors.proxy("dropbox", "/2/files/list_folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, recursive: false }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

router.post("/dropbox/sync", async (req, res) => {
  try {
    const connectors = new ReplitConnectors();

    const content = await downloadFromDropbox(
      connectors,
      "/Apps/roc.Kasse/Voucher.text"
    );

    const lines = content.split("\n").filter((l) => l.trim());
    if (!lines.length) {
      return res.json({
        success: false,
        message: "Datei ist leer",
        recordsProcessed: 0,
        filename: null,
      });
    }

    const today = formatDate(new Date());
    const lastLineIdx = lines.length - 1;
    const lastLine = lines[lastLineIdx];

    const parts = lastLine.split("\t");
    while (parts.length < 7) parts.push("");
    if (!parts[3]) {
      parts[3] = today;
    }
    lines[lastLineIdx] = parts.join("\t");

    const updatedContent = lines.join("\n");

    const parsedVouchers = [];
    for (const line of lines) {
      const cols = line.split("\t");
      if (cols.length < 3) continue;
      parsedVouchers.push({
        gutscheinnummer: cols[0]?.trim() ?? "",
        betrag: cols[1]?.trim() ?? "0",
        key: cols[2]?.trim() ?? "",
        ausstellungsdatum: cols[3]?.trim() || null,
        einloesung1: cols[4]?.trim() || null,
        einloesung2: cols[5]?.trim() || null,
        einloesung3: cols[6]?.trim() || null,
      });
    }

    const validVouchers = parsedVouchers.filter((v) => v.gutscheinnummer);

    if (validVouchers.length > 0) {
      await db.delete(vouchersTable);
      for (const v of validVouchers) {
        const betr = parseFloat(v.betrag.replace(",", "."));
        await db.insert(vouchersTable).values({
          gutscheinnummer: v.gutscheinnummer,
          betrag: isNaN(betr) ? "0" : String(betr),
          key: v.key,
          ausstellungsdatum: v.ausstellungsdatum,
          einloesung1: v.einloesung1,
          einloesung2: v.einloesung2,
          einloesung3: v.einloesung3,
        });
      }
    }

    const filename = generateFilename();
    const dbVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.id);
    const csvContent = vouchersToCSV(dbVouchers);
    await uploadToDropbox(connectors, `/Apps/roc.Kasse/${filename}`, csvContent);

    res.json({
      success: true,
      message: `Synchronisierung erfolgreich. ${validVouchers.length} Datensätze importiert.`,
      recordsProcessed: validVouchers.length,
      filename,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[dropbox/sync] error:", err);
    res.status(500).json({
      success: false,
      message: `Fehler bei der Synchronisierung: ${message}`,
      recordsProcessed: null,
      filename: null,
    });
  }
});

router.post("/dropbox/export", async (req, res) => {
  try {
    const connectors = new ReplitConnectors();
    const vouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.id);
    const csvContent = vouchersToCSV(vouchers);
    const filename = generateFilename();
    await uploadToDropbox(connectors, `/Apps/roc.Kasse/${filename}`, csvContent);

    res.json({
      success: true,
      message: `${vouchers.length} Gutscheine als CSV exportiert.`,
      recordsProcessed: vouchers.length,
      filename,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    res.status(500).json({
      success: false,
      message: `Fehler beim Export: ${message}`,
      recordsProcessed: null,
      filename: null,
    });
  }
});

interface DropboxEntry {
  ".tag": string;
  path_display: string;
  name: string;
  server_modified?: string;
}

// ── Helper: list all rocInvoiceItem_ files recursively, filtered by year ─────
async function listInvoiceFiles(
  connectors: ReplitConnectors,
  basePath: string,
  fromYear: number,
): Promise<string[]> {
  const paths: string[] = [];
  const cutoff = new Date(`${fromYear}-01-01T00:00:00Z`);

  const initRes = await connectors.proxy("dropbox", "/2/files/list_folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: basePath, recursive: true, limit: 2000 }),
  });
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new Error(`Dropbox list_folder failed: ${initRes.status} ${t.substring(0, 200)}`);
  }
  const initData = await initRes.json() as { entries: DropboxEntry[]; has_more: boolean; cursor: string };

  for (const e of initData.entries) {
    if (
      e[".tag"] === "file" &&
      e.name.startsWith("rocInvoiceItem_") &&
      (!e.server_modified || new Date(e.server_modified) >= cutoff)
    ) {
      paths.push(e.path_display);
    }
  }

  let cursor: string | null = initData.has_more ? initData.cursor : null;
  while (cursor) {
    const contRes = await connectors.proxy("dropbox", "/2/files/list_folder/continue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursor }),
    });
    if (!contRes.ok) break;
    const contData = await contRes.json() as { entries: DropboxEntry[]; has_more: boolean; cursor: string };
    for (const e of contData.entries) {
      if (
        e[".tag"] === "file" &&
        e.name.startsWith("rocInvoiceItem_") &&
        (!e.server_modified || new Date(e.server_modified) >= cutoff)
      ) {
        paths.push(e.path_display);
      }
    }
    cursor = contData.has_more ? contData.cursor : null;
  }

  return paths;
}

// ── Helper: download files in parallel batches ────────────────────────────────
async function downloadBatch(
  connectors: ReplitConnectors,
  paths: string[],
  batchSize = 8,
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (p) => ({ path: p, content: await downloadFromDropbox(connectors, p) })),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

// ── Helper: parse date string like "18.06.26 15:36:25 MESZ" → "18.06.2026" ─
function parseRocDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const datePart = raw.trim().split(" ")[0]; // "18.06.26"
  const parts = datePart.split(".");
  if (parts.length < 3) return null;
  const [day, month, yearRaw] = parts;
  const year = Number(yearRaw) < 100 ? 2000 + Number(yearRaw) : Number(yearRaw);
  if (isNaN(year)) return null;
  return `${day.padStart(2, "0")}.${month.padStart(2, "0")}.${year}`;
}

// ── Helper: parse one rocInvoiceItem file ─────────────────────────────────────
interface InvoiceEntry {
  voucherNum: string;
  date: string;
  type: "issuance" | "redemption";
}

function parseInvoiceFile(content: string): InvoiceEntry[] {
  const results: InvoiceEntry[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.includes("BillPrinted")) continue;
    const cols = line.split("\t");
    const billIdx = cols.indexOf("BillPrinted");
    if (billIdx === -1) continue;
    const voucherNum = (cols[billIdx + 1] ?? "").trim();
    const rawDate = (cols[billIdx + 3] ?? "").trim();
    if (!voucherNum || !rawDate) continue;
    const date = parseRocDate(rawDate);
    if (!date) continue;
    // Detect type: look for "einloesen" or "eingelöst" keywords in the line
    const lineLower = line.toLowerCase();
    const type: InvoiceEntry["type"] =
      lineLower.includes("einloesen") || lineLower.includes("einlösen") || lineLower.includes("eingelöst")
        ? "redemption"
        : "issuance";
    results.push({ voucherNum, date, type });
  }
  return results;
}

// Shared scan state so frontend can poll progress
let scanState: { running: boolean; message: string; updatedCount: number; filesProcessed: number } = {
  running: false,
  message: "Kein Scan aktiv",
  updatedCount: 0,
  filesProcessed: 0,
};

router.get("/dropbox/scan-status", (_req, res) => {
  res.json(scanState);
});

async function runScanInBackground(fromYear: number) {
  if (scanState.running) return;
  scanState = { running: true, message: "Starte Scan...", updatedCount: 0, filesProcessed: 0 };

  try {
    const connectors = new ReplitConnectors();
    const basePath = "/Apps/roc.Kasse/filialeKalit2017";

    scanState.message = `Suche Dateien ab ${fromYear}...`;
    console.log(`[scan-invoices] listing rocInvoiceItem_ files since ${fromYear}...`);
    const filePaths = await listInvoiceFiles(connectors, basePath, fromYear);
    console.log(`[scan-invoices] found ${filePaths.length} invoice files`);
    scanState.message = `${filePaths.length} Dateien gefunden, lade herunter...`;

    // Download in parallel batches and parse
    const byVoucher = new Map<string, InvoiceEntry[]>();
    const downloaded = await downloadBatch(connectors, filePaths);
    scanState.filesProcessed = downloaded.length;

    for (const { content } of downloaded) {
      const entries = parseInvoiceFile(content);
      for (const entry of entries) {
        const existing = byVoucher.get(entry.voucherNum) ?? [];
        existing.push(entry);
        byVoucher.set(entry.voucherNum, existing);
      }
    }

    console.log(`[scan-invoices] processed ${scanState.filesProcessed} files, found entries for ${byVoucher.size} voucher numbers`);
    scanState.message = `${scanState.filesProcessed} Dateien verarbeitet, aktualisiere Datenbank...`;

    // Load all vouchers from DB (keyed by gutscheinnummer)
    const allVouchers = await db.select().from(vouchersTable);
    const voucherMap = new Map(allVouchers.map((v) => [String(v.gutscheinnummer), v]));

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const [voucherNum, entries] of byVoucher.entries()) {
      const voucher = voucherMap.get(voucherNum);
      if (!voucher) {
        notFoundCount++;
        continue;
      }

      const issuances = entries.filter((e) => e.type === "issuance").sort((a, b) => a.date.localeCompare(b.date));
      const redemptions = entries.filter((e) => e.type === "redemption").sort((a, b) => a.date.localeCompare(b.date));

      const update: Record<string, string | null> = {};

      if (issuances.length > 0 && !voucher.ausstellungsdatum) {
        update.ausstellungsdatum = issuances[0].date;
      }
      if (redemptions[0] && !voucher.einloesung1) update.einloesung1 = redemptions[0].date;
      if (redemptions[1] && !voucher.einloesung2) update.einloesung2 = redemptions[1].date;
      if (redemptions[2] && !voucher.einloesung3) update.einloesung3 = redemptions[2].date;

      if (Object.keys(update).length === 0) continue;

      await db
        .update(vouchersTable)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(vouchersTable.id, voucher.id));
      updatedCount++;
    }

    // Export updated CSV to Dropbox
    const dbVouchers = await db.select().from(vouchersTable).orderBy(vouchersTable.id);
    const csvContent = vouchersToCSV(dbVouchers);
    const filename = generateFilename();
    await uploadToDropbox(connectors, `/Apps/roc.Kasse/${filename}`, csvContent);

    scanState = {
      running: false,
      message: `Scan abgeschlossen: ${scanState.filesProcessed} Dateien, ${byVoucher.size} Nummern gefunden, ${updatedCount} Gutscheine aktualisiert, ${notFoundCount} nicht zugeordnet.`,
      updatedCount,
      filesProcessed: scanState.filesProcessed,
    };
    console.log("[scan-invoices] done:", scanState.message);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("[scan-invoices] error:", err);
    scanState = {
      running: false,
      message: `Fehler beim Scannen: ${message}`,
      updatedCount: 0,
      filesProcessed: scanState.filesProcessed,
    };
  }
}

router.post("/dropbox/scan-invoices", (req, res) => {
  const fromYear = Number(req.body?.fromYear ?? new Date().getFullYear() - 2);

  if (scanState.running) {
    res.json({
      success: true,
      message: `Scan läuft bereits: ${scanState.message}`,
      recordsProcessed: null,
      filename: null,
    });
    return;
  }

  // Fire-and-forget — response returns immediately
  runScanInBackground(fromYear).catch((e) =>
    console.error("[scan-invoices] unhandled:", e),
  );

  res.json({
    success: true,
    message: `Scan gestartet (ab ${fromYear}). Status unter /api/dropbox/scan-status abrufbar.`,
    recordsProcessed: null,
    filename: null,
  });
});

export default router;
