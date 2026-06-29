import { Router } from "express";
import { db, sumupTransactionsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import {
  BulkDeleteSumupTransactionsBody,
  UpdateSumupTransactionBody,
  UpdateSumupTransactionParams,
  DeleteSumupTransactionParams,
} from "@workspace/api-zod";

const DROPBOX_TOKEN_KEY = "dropbox_access_token";
const DROPBOX_FOLDER = "/Apps/roc.kasse";

const router = Router();

async function getStoredToken(): Promise<string | null> {
  try {
    const { settingsTable } = await import("@workspace/db");
    const { eq: eqOp } = await import("drizzle-orm");
    const row = await db.select().from(settingsTable).where(eqOp(settingsTable.key, DROPBOX_TOKEN_KEY)).limit(1);
    return row.length > 0 ? row[0].value : null;
  } catch {
    return null;
  }
}

async function dropboxApiCall(token: string, endpoint: string, body: object): Promise<Response> {
  return fetch(`https://api.dropboxapi.com${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCSVLine(lines[0], delimiter);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i], delimiter);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function rowsToCSV(rows: Record<string, string>[], columns: string[]): string {
  const header = columns.join(";");
  const lines = rows.map((row) =>
    columns.map((col) => {
      const val = row[col] ?? "";
      return val.includes(";") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
    }).join(";")
  );
  return [header, ...lines].join("\n");
}

router.get("/sumup/transactions", async (req, res) => {
  try {
    const { search, sortKey, sortDir, filters: filtersStr } = req.query as Record<string, string>;
    let rows = await db.select().from(sumupTransactionsTable);

    let filters: Record<string, string> = {};
    try { if (filtersStr) filters = JSON.parse(filtersStr); } catch { /* ignore */ }

    let result = rows.map((r) => ({ id: r.id, data: r.data as Record<string, string>, importedAt: r.importedAt.toISOString() }));

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((r) => Object.values(r.data).some((v) => v.toLowerCase().includes(s)));
    }

    for (const [col, val] of Object.entries(filters)) {
      if (val) {
        const v = val.toLowerCase();
        result = result.filter((r) => (r.data[col] ?? "").toLowerCase().includes(v));
      }
    }

    if (sortKey) {
      result.sort((a, b) => {
        const av = a.data[sortKey] ?? "";
        const bv = b.data[sortKey] ?? "";
        const cmp = av.localeCompare(bv, "de", { numeric: true });
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/sumup/transactions/stats", async (_req, res) => {
  try {
    const rows = await db.select().from(sumupTransactionsTable);
    const data = rows.map((r) => r.data as Record<string, string>);

    const parseNum = (v: string) => {
      if (!v) return 0;
      return parseFloat(v.replace(",", ".").replace(/[^\d.\-]/g, "")) || 0;
    };

    const BETRAG_KEYS = ["Betrag", "Bruttoertrag", "Transaktionsbetrag"];
    const GEBUEHR_KEYS = ["Gebühren", "Gebühr", "Gebuehr"];
    const NETTO_KEYS = ["Nettoertrag", "Nettobetrag", "Netto"];

    const findKey = (obj: Record<string, string>, candidates: string[]) =>
      candidates.find((k) => k in obj) ?? null;

    let totalBetrag = 0, totalGebuehr = 0, totalNetto = 0;
    for (const row of data) {
      const bk = findKey(row, BETRAG_KEYS);
      const gk = findKey(row, GEBUEHR_KEYS);
      const nk = findKey(row, NETTO_KEYS);
      if (bk) totalBetrag += parseNum(row[bk]);
      if (gk) totalGebuehr += parseNum(row[gk]);
      if (nk) totalNetto += parseNum(row[nk]);
    }

    const latest = rows.reduce((acc, r) => (!acc || r.importedAt > acc ? r.importedAt : acc), null as Date | null);

    res.json({
      total: rows.length,
      totalBetrag: Math.round(totalBetrag * 100) / 100,
      totalGebuehr: Math.round(totalGebuehr * 100) / 100,
      totalNetto: Math.round(totalNetto * 100) / 100,
      importedAt: latest ? latest.toISOString() : null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/sumup/transactions/columns", async (_req, res) => {
  try {
    const row = await db.select().from(sumupTransactionsTable).limit(1);
    if (!row.length) return res.json([]);
    const cols = Object.keys(row[0].data as Record<string, string>);
    res.json(cols);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/sumup/transactions/:id", async (req, res) => {
  try {
    const { id } = UpdateSumupTransactionParams.parse(req.params);
    const { data } = UpdateSumupTransactionBody.parse(req.body);
    const updated = await db.update(sumupTransactionsTable).set({ data }).where(eq(sumupTransactionsTable.id, id)).returning();
    if (!updated.length) return res.status(404).json({ error: "Not found" });
    const r = updated[0];
    res.json({ id: r.id, data: r.data, importedAt: r.importedAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/sumup/transactions/:id", async (req, res) => {
  try {
    const { id } = DeleteSumupTransactionParams.parse(req.params);
    await db.delete(sumupTransactionsTable).where(eq(sumupTransactionsTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/sumup/transactions", async (req, res) => {
  try {
    const { ids } = BulkDeleteSumupTransactionsBody.parse(req.body);
    if (!ids.length) return res.json({ deleted: 0 });
    await db.delete(sumupTransactionsTable).where(inArray(sumupTransactionsTable.id, ids));
    res.json({ deleted: ids.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sumup/import", async (_req, res) => {
  try {
    const token = await getStoredToken();
    if (!token) return res.status(400).json({ success: false, message: "Kein Dropbox-Token gespeichert. Bitte Token in den Einstellungen hinterlegen." });

    const listRes = await dropboxApiCall(token, "/2/files/list_folder", { path: DROPBOX_FOLDER, recursive: false });
    const listData = await listRes.json() as { entries?: Array<{ name: string; path_lower: string; ".tag": string }> };

    const entries = listData.entries ?? [];
    const csvFile = entries.find((e) => e[".tag"] === "file" && e.name.toLowerCase().startsWith("transaktionsbericht") && e.name.toLowerCase().endsWith(".csv"));

    if (!csvFile) return res.status(404).json({ success: false, message: "Keine Transaktionsbericht-CSV-Datei in /Apps/roc.kasse gefunden." });

    const linkRes = await dropboxApiCall(token, "/2/files/get_temporary_link", { path: csvFile.path_lower });
    const linkData = await linkRes.json() as { link?: string };
    if (!linkData.link) return res.status(500).json({ success: false, message: "Konnte keinen Download-Link erstellen." });

    const fileRes = await fetch(linkData.link);
    const rawText = await fileRes.text();

    const rows = parseCSV(rawText);
    if (!rows.length) return res.json({ success: false, message: "Keine Daten in der CSV-Datei gefunden.", recordsImported: 0, filename: csvFile.name });

    await db.delete(sumupTransactionsTable);
    await db.insert(sumupTransactionsTable).values(rows.map((data) => ({ data })));

    res.json({ success: true, message: `${rows.length} Transaktionen importiert.`, recordsImported: rows.length, filename: csvFile.name });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

router.post("/sumup/export", async (_req, res) => {
  try {
    const token = await getStoredToken();
    if (!token) return res.status(400).json({ success: false, message: "Kein Dropbox-Token gespeichert." });

    const rows = await db.select().from(sumupTransactionsTable);
    if (!rows.length) return res.json({ success: false, message: "Keine Transaktionen zum Exportieren." });

    const data = rows.map((r) => r.data as Record<string, string>);
    const columns = Object.keys(data[0]);
    const csvContent = rowsToCSV(data, columns);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const filename = `Transaktionsbericht_Export_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    const dropboxPath = `${DROPBOX_FOLDER}/${filename}`;

    const uploadLinkRes = await dropboxApiCall(token, "/2/files/get_temporary_upload_link", {
      commit_info: { path: dropboxPath, mode: "add", autorename: true },
      duration: 3600,
    });
    const uploadLinkData = await uploadLinkRes.json() as { link?: string };
    if (!uploadLinkData.link) return res.status(500).json({ success: false, message: "Konnte keinen Upload-Link erstellen." });

    await fetch(uploadLinkData.link, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(csvContent, "utf-8"),
    });

    res.json({ success: true, message: `Export erfolgreich: ${filename}`, filename });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

export default router;
