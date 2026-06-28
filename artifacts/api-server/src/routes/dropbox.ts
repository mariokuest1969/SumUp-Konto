import { Router } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import { vouchersTable } from "@workspace/db";

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
  const response = await connectors.proxy("dropbox", "/2/files/download", {
    method: "POST",
    headers: {
      "Dropbox-API-Arg": JSON.stringify({ path }),
      "Content-Type": "",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Dropbox download failed: ${response.status} ${text}`);
  }
  return response.text();
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

export default router;
