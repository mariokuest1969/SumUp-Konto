---
name: SumUp UIW export & dialog prefill
description: How the UIW transfer dialog prefills recipient data, SumUp CSV column names, Dropbox upload, and date format quirks
---

# UIW-Überweisung export (SumUp Konto)

The UIW dialog turns selected transaction rows into bank-transfer (Überweisung) export lines.
One UIW CSV line per selected row, fields: `Empfängertyp;Name;Land;IBAN;Betrag;Referenz`.

## SumUp CSV column names (production-verified)
- Available balance: **"Verfügbares Guthaben"** (NOT "Verfügbarer Betrag")
- Transaction date: **"Datum der Transaktion"** — format `DD.MM.YY, HH:MM` (2-digit year, comma+space before time, date+time in same field — no separate time column)
- Name + IBAN source for UIW: **"Referenz"** column (e.g. `"Firma GmbH DE66150505000384001033"`)
- Payment reference for UIW: **"Zahlungsreferenz"** column

## Date sorting (`toSortableDate`)
Must handle both `DD.MM.YYYY` and `DD.MM.YY, HH:MM` formats.
For 2-digit year: yy < 50 → 2000+yy, yy >= 50 → 1900+yy. Strip leading `, ` before time part to get `YYYY-MM-DD HH:MM`.

## Prefill convention (user-confirmed)
- **Betrag** ← extracted from the transaction amount column.
- **Referenz** ← `data["Zahlungsreferenz"]` (fallback: Verwendungszweck, Betreff, Mitteilung).
- **Name + IBAN** ← parsed from the per-row **Notiz** free-text first, then `data["Referenz"]` as fallback (`parseRecipientFromNotiz`). A compact IBAN token (word-boundary-bounded, OR grouped in 4s, length 15–34) is extracted; the remainder becomes the name.
- Multi-select: every checked row becomes its own editable line; shared Empfängertyp + Land across all rows.

## CSV escaping (required)
Fields joined with `;` must be CSV-escaped (wrap in quotes + double embedded quotes when value contains `;` or `"`; strip newlines).

## Dropbox upload
- Use `https://content.dropboxapi.com/2/files/upload` with `Dropbox-API-Arg` header (NOT `get_temporary_upload_link` — unreliable).
- Token needs **`files.content.write`** scope — read-only tokens cause HTTP 400 from Dropbox.
- Always `.trim()` the stored token before use.

**Why:** `get_temporary_upload_link` failed in production; direct upload endpoint is simpler and reliable.

## React hooks rule (learned the hard way)
`React.useMemo` and ALL hooks must be called BEFORE any early `return` statement in a component, even when logically only needed in the non-early path.
