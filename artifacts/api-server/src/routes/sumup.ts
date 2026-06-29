import { Router } from "express";
import { db, sumupTransactionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  BulkDeleteSumupTransactionsBody,
  UpdateSumupTransactionBody,
  UpdateSumupTransactionParams,
  DeleteSumupTransactionParams,
  BulkNoteSumupTransactionsBody,
} from "@workspace/api-zod";

const DROPBOX_TOKEN_KEY = "dropbox_access_token";
const SUMUP_IMPORT_PATH_KEY = "sumup_import_path";
const SUMUP_EXPORT_PATH_KEY = "sumup_export_path";
const DEFAULT_FOLDER = "/Apps/roc.kasse";

const router = Router();

async function getStoredSetting(key: string, fallback: string | null = null): Promise<string | null> {
  try {
    const { settingsTable } = await import("@workspace/db");
    const { eq: eqOp } = await import("drizzle-orm");
    const row = await db.select().from(settingsTable).where(eqOp(settingsTable.key, key)).limit(1);
    return row.length > 0 ? row[0].value : fallback;
  } catch {
    return fallback;
  }
}

const getStoredToken = () => getStoredSetting(DROPBOX_TOKEN_KEY);
const getImportPath = () => getStoredSetting(SUMUP_IMPORT_PATH_KEY, DEFAULT_FOLDER);
const getExportPath = () => getStoredSetting(SUMUP_EXPORT_PATH_KEY, DEFAULT_FOLDER);

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
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] ?? "").trim(); });
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
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === delimiter && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
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

function parseNum(v: string): number {
  if (!v) return 0;
  return parseFloat(v.replace(",", ".").replace(/[^\d.\-]/g, "")) || 0;
}

const SALDO_KEYS = ["Verfügbares Guthaben", "Verfügbarer Betrag", "Verfuegbares Guthaben", "Verfuegbarer Betrag", "Kontostand", "Saldo", "Balance", "Guthaben"];
const DATE_KEYS = ["Datum der Transaktion", "Datum", "Date", "Transaktionsdatum"];
const TIME_KEYS = ["Uhrzeit der Transaktion", "Uhrzeit", "Zeit", "Time"];

// Convert DD.MM.YYYY[ HH:MM:SS] or DD.MM.YY[, HH:MM] → YYYY-MM-DD[ HH:MM:SS] for correct chronological sort.
// Falls back to original string for other formats (ISO dates already sort correctly).
function toSortableDate(raw: string): string {
  const s = raw.trim();
  // 4-digit year: DD.MM.YYYY...
  const m4 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})(.*)/);
  if (m4) return `${m4[3]}-${m4[2]}-${m4[1]}${m4[4]}`;
  // 2-digit year: DD.MM.YY[, HH:MM] — e.g. "29.06.26, 08:46"
  const m2 = s.match(/^(\d{2})\.(\d{2})\.(\d{2})(.*)/);
  if (m2) {
    const yy = parseInt(m2[3], 10);
    const yyyy = yy >= 50 ? 1900 + yy : 2000 + yy;
    const rest = m2[4].replace(/^,\s*/, " "); // replace leading ", " with space
    return `${yyyy}-${m2[2]}-${m2[1]}${rest}`;
  }
  return s;
}

router.get("/sumup/transactions", async (req, res) => {
  try {
    const { search, sortKey, sortDir, filters: filtersStr } = req.query as Record<string, string>;
    const rows = await db.select().from(sumupTransactionsTable);

    let filters: Record<string, string> = {};
    try { if (filtersStr) filters = JSON.parse(filtersStr); } catch { /* ignore */ }

    let result = rows.map((r) => ({
      id: r.id,
      data: r.data as Record<string, string>,
      notiz: r.notiz ?? null,
      importedAt: r.importedAt.toISOString(),
    }));

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((r) =>
        Object.values(r.data).some((v) => v.toLowerCase().includes(s)) ||
        (r.notiz ?? "").toLowerCase().includes(s)
      );
    }

    for (const [col, val] of Object.entries(filters)) {
      if (val) {
        const v = val.toLowerCase();
        if (col === "__notiz__") {
          result = result.filter((r) => (r.notiz ?? "").toLowerCase().includes(v));
        } else {
          result = result.filter((r) => (r.data[col] ?? "").toLowerCase().includes(v));
        }
      }
    }

    if (sortKey) {
      const isDateCol = DATE_KEYS.includes(sortKey);
      result.sort((a, b) => {
        let av = a.data[sortKey] ?? "";
        let bv = b.data[sortKey] ?? "";
        if (isDateCol) { av = toSortableDate(av); bv = toSortableDate(bv); }
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

    const findKey = (obj: Record<string, string>, candidates: string[]) =>
      candidates.find((k) => k in obj) ?? null;

    const BETRAG_KEYS = ["Betrag", "Bruttoertrag", "Transaktionsbetrag", "Bruttobetrag"];
    const GEBUEHR_KEYS = ["Gebühren", "Gebühr", "Gebuehr", "Fee"];
    const NETTO_KEYS = ["Nettoertrag", "Nettobetrag", "Netto", "Net"];

    let totalBetrag = 0, totalGebuehr = 0, totalNetto = 0;
    for (const row of data) {
      const bk = findKey(row, BETRAG_KEYS);
      const gk = findKey(row, GEBUEHR_KEYS);
      const nk = findKey(row, NETTO_KEYS);
      if (bk) totalBetrag += parseNum(row[bk]);
      if (gk) totalGebuehr += parseNum(row[gk]);
      if (nk) totalNetto += parseNum(row[nk]);
    }

    // Current saldo: value of the saldo column in the most recent row (by date+time)
    let currentSaldo: number | null = null;
    if (data.length > 0) {
      const sample = data[0];
      const dateKey = findKey(sample, DATE_KEYS);
      const timeKey = findKey(sample, TIME_KEYS);
      const saldoKey = findKey(sample, SALDO_KEYS);
      // If no dedicated saldo column, use the last column
      const lastColKey = saldoKey ?? Object.keys(sample).at(-1) ?? null;

      if (lastColKey) {
        const sorted = [...data].sort((a, b) => {
          const aStr = toSortableDate(dateKey ? a[dateKey] : "") + " " + (timeKey ? a[timeKey] : "");
          const bStr = toSortableDate(dateKey ? b[dateKey] : "") + " " + (timeKey ? b[timeKey] : "");
          return bStr.localeCompare(aStr);
        });
        currentSaldo = parseNum(sorted[0][lastColKey]);
      }
    }

    const latest = rows.reduce<Date | null>((acc, r) => (!acc || r.importedAt > acc ? r.importedAt : acc), null);

    res.json({
      total: rows.length,
      totalBetrag: Math.round(totalBetrag * 100) / 100,
      totalGebuehr: Math.round(totalGebuehr * 100) / 100,
      totalNetto: Math.round(totalNetto * 100) / 100,
      currentSaldo,
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
    const body = UpdateSumupTransactionBody.parse(req.body);
    const updatePayload: { data?: Record<string, string>; notiz?: string | null } = {};
    if (body.data !== undefined) updatePayload.data = body.data;
    if (body.notiz !== undefined) updatePayload.notiz = body.notiz;
    const updated = await db.update(sumupTransactionsTable).set(updatePayload).where(eq(sumupTransactionsTable.id, id)).returning();
    if (!updated.length) return res.status(404).json({ error: "Not found" });
    const r = updated[0];
    res.json({ id: r.id, data: r.data, notiz: r.notiz ?? null, importedAt: r.importedAt.toISOString() });
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

router.post("/sumup/transactions/bulk-note", async (req, res) => {
  try {
    const { ids, notiz } = BulkNoteSumupTransactionsBody.parse(req.body);
    if (!ids.length) return res.json({ updated: 0 });
    await db.update(sumupTransactionsTable).set({ notiz }).where(inArray(sumupTransactionsTable.id, ids));
    res.json({ updated: ids.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const UIW_HEADER = "Empfängertyp;Privatperson oder Geschäftsname;Land des Wohnsitzes oder der Registrierung (2-Buchstaben-Code);IBAN;Betrag (EUR);Referenz (optional)";

router.post("/sumup/uiw-export", async (req, res) => {
  try {
    const token = await getStoredToken();
    if (!token) return res.status(400).json({ success: false, message: "Kein Dropbox-Token gespeichert." });

    interface UIWRow { empfaengertyp: string; name: string; land: string; iban: string; betrag: string; referenz?: string }
    const { rows } = req.body as { rows: UIWRow[] };
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: "Keine Zeilen übergeben." });

    const esc = (v: string) => {
      const s = (v ?? "").replace(/[\r\n]+/g, " ");
      return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csvLines = rows.map(r =>
      [r.empfaengertyp, r.name, r.land, r.iban.replace(/\s+/g, ""), r.betrag, r.referenz ?? ""]
        .map(esc)
        .join(";")
    );
    const csvContent = [UIW_HEADER, ...csvLines].join("\n");
    // No BOM — plain UTF-8
    const fileBuffer = Buffer.from(csvContent, "utf-8");

    const exportFolder = (await getExportPath()) ?? DEFAULT_FOLDER;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const uiwFilename = `UIW_${timestamp}.csv`;
    const dropboxPath = `${exportFolder}/${uiwFilename}`;

    const uploadLinkRes = await dropboxApiCall(token, "/2/files/get_temporary_upload_link", {
      commit_info: { path: dropboxPath, mode: "add", autorename: true },
      duration: 3600,
    });
    const uploadLinkData = await uploadLinkRes.json() as { link?: string };
    if (!uploadLinkData.link) return res.status(500).json({ success: false, message: "Konnte keinen Upload-Link erstellen." });

    const uploadRes = await fetch(uploadLinkData.link, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: fileBuffer,
    });
    if (!uploadRes.ok) {
      const detail = await uploadRes.text();
      return res.status(502).json({ success: false, message: `Dropbox-Upload fehlgeschlagen: ${detail || uploadRes.statusText}` });
    }

    res.json({ success: true, message: `${uiwFilename} mit ${rows.length} Zeile(n) in Dropbox gespeichert.`, filename: uiwFilename });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

router.post("/sumup/import", async (_req, res) => {
  try {
    const token = await getStoredToken();
    if (!token) return res.status(400).json({ success: false, message: "Kein Dropbox-Token gespeichert. Bitte Token in den Einstellungen hinterlegen." });

    const importFolder = (await getImportPath()) ?? DEFAULT_FOLDER;
    const listRes = await dropboxApiCall(token, "/2/files/list_folder", { path: importFolder, recursive: false });
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

    // Only insert rows that don't already exist — preserves notizen on existing rows
    const existingRows = await db.select().from(sumupTransactionsTable);
    const existingKeys = new Set(existingRows.map(r => JSON.stringify(r.data)));

    const newRows = rows.filter(data => !existingKeys.has(JSON.stringify(data)));
    if (newRows.length > 0) {
      await db.insert(sumupTransactionsTable).values(newRows.map(data => ({ data, notiz: null })));
    }

    const skipped = rows.length - newRows.length;
    const msg = newRows.length > 0
      ? `${newRows.length} neue Transaktionen importiert${skipped > 0 ? `, ${skipped} bereits vorhanden (übersprungen)` : ""}.`
      : `Keine neuen Transaktionen — alle ${skipped} Einträge bereits vorhanden.`;

    res.json({ success: true, message: msg, recordsImported: newRows.length, filename: csvFile.name });
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

    const data = rows.map((r) => ({ ...(r.data as Record<string, string>), Notiz: r.notiz ?? "" }));
    const columns = Object.keys(data[0]);
    const csvContent = rowsToCSV(data, columns);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const filename = `Transaktionsbericht_Export_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
    const exportFolder = (await getExportPath()) ?? DEFAULT_FOLDER;
    const dropboxPath = `${exportFolder}/${filename}`;

    const uploadLinkRes = await dropboxApiCall(token, "/2/files/get_temporary_upload_link", {
      commit_info: { path: dropboxPath, mode: "add", autorename: true },
      duration: 3600,
    });
    const uploadLinkData = await uploadLinkRes.json() as { link?: string };
    if (!uploadLinkData.link) return res.status(500).json({ success: false, message: "Konnte keinen Upload-Link erstellen." });

    const uploadRes = await fetch(uploadLinkData.link, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(csvContent, "utf-8"),
    });
    if (!uploadRes.ok) {
      const detail = await uploadRes.text();
      return res.status(502).json({ success: false, message: `Dropbox-Upload fehlgeschlagen: ${detail || uploadRes.statusText}` });
    }

    res.json({ success: true, message: `Export erfolgreich: ${filename}`, filename });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
});

export default router;
