---
name: SumUp UIW export & dialog prefill
description: How the UIW transfer dialog prefills recipient data and how the export CSV must be escaped
---

# UIW-Überweisung export (SumUp Konto)

The UIW dialog turns selected transaction rows into bank-transfer (Überweisung) export lines.
One UIW CSV line per selected row, fields: `Empfängertyp;Name;Land;IBAN;Betrag;Referenz`.

## Prefill convention (user-confirmed)
- **Betrag** ← extracted from the transaction amount.
- **Referenz** ← the transaction *description* (date · fields), not the note.
- **Name + IBAN** ← parsed from the per-row **Notiz** free-text column. The user stores recipient name and IBAN together in the note; a parser extracts an IBAN-like token (compact, word-boundary-bounded, OR grouped in 4s, length 15–34) and treats the remainder as the name.
- Multi-select: every checked row becomes its own editable line; a "Gleicher Empfänger für alle Zeilen" quick-fill with "Auf alle Zeilen anwenden" copies one name/IBAN into all rows. Empfängertyp + Land are shared across all rows.

**Why:** recipient name/IBAN are NOT present in SumUp CSV data, so they must come from the user-entered note; description is the natural payment reference.

## CSV escaping (required)
The UIW export joins fields with `;`. Because Name/Referenz now come from free text, fields **must be CSV-escaped** (wrap in quotes + double embedded quotes when the value contains `;` or `"`; strip newlines). Without this, a semicolon or newline in a note shifts columns and corrupts the file.
**How to apply:** any time fields from user free-text are written into the `;`-joined UIW CSV, escape per-field.
