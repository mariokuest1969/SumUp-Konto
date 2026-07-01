import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Landmark, FileDown, Copy, Download } from "lucide-react";

export interface UIWDialogRow {
  transactionId: number;
  betrag: string;
  description: string;
  notiz?: string;
  transactionReferenz?: string;
  zahlungsreferenz?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: UIWDialogRow[];
}

interface RowDraft {
  name: string;
  iban: string;
  betrag: string;
  referenz: string;
}

function cleanIban(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Parst Empfängername + IBAN aus einem Freitext-String.
// Erkennt entweder eine kompakte IBAN (ohne Leerzeichen) oder eine in
// Vierergruppen geschriebene IBAN. Der verbleibende Text gilt als Name.
// Wenn notiz keine IBAN enthält, wird transactionReferenz als Fallback versucht.
function parseFromText(text: string): { name: string; iban: string } {
  if (!text || !text.trim()) return { name: "", iban: "" };

  let raw = "";
  let iban = "";

  const compact = text.match(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/i);
  if (compact) {
    raw = compact[0];
    iban = cleanIban(raw);
  } else {
    const grouped = text.match(/\b[A-Z]{2}[0-9]{2}(?:\s[A-Z0-9]{2,4}){2,8}\b/i);
    if (grouped) {
      const clean = cleanIban(grouped[0]);
      if (clean.length >= 15 && clean.length <= 34) {
        raw = grouped[0];
        iban = clean;
      }
    }
  }

  let name = raw ? text.replace(raw, " ") : text;
  name = name
    .replace(/\bIBAN\b\s*:?/i, "")
    .replace(/[;,|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name, iban };
}

function parseRecipientFromNotiz(notiz: string, referenz?: string): { name: string; iban: string } {
  const fromNotiz = parseFromText(notiz ?? "");
  if (fromNotiz.iban) return fromNotiz;
  if (referenz) {
    const fromRef = parseFromText(referenz);
    if (fromRef.iban) return fromRef;
    if (!fromNotiz.name && fromRef.name) return fromRef;
  }
  return fromNotiz;
}

export function SumupUIWDialog({ open, onOpenChange, rows }: Props) {
  const { toast } = useToast();
  const [empfaengertyp, setEmpfaengertyp] = useState<"Privatperson" | "Geschäft">("Privatperson");
  const [land, setLand] = useState("DE");
  const [sharedName, setSharedName] = useState("");
  const [sharedIban, setSharedIban] = useState("");
  const [rowDrafts, setRowDrafts] = useState<RowDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRowDrafts(rows.map(r => {
      const { name, iban } = parseRecipientFromNotiz(r.notiz ?? "", r.transactionReferenz);
      return {
        name,
        iban,
        betrag: r.betrag,
        referenz: r.zahlungsreferenz || "",
      };
    }));
    setSharedName("");
    setSharedIban("");
  }, [open, rows]);

  const isSingle = rows.length === 1;

  const updateDraft = (idx: number, field: keyof RowDraft, val: string) => {
    setRowDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
  };

  const applyToAll = () => {
    setRowDrafts(prev => prev.map(d => ({ ...d, name: sharedName, iban: sharedIban })));
    toast({ title: `Empfänger auf ${rows.length} Zeile(n) übernommen` });
  };

  const UIW_HEADER = "Empfängertyp;Privatperson oder Geschäftsname;Land des Wohnsitzes oder der Registrierung (2-Buchstaben-Code);IBAN;Betrag (EUR);Referenz (optional)";

  const esc = (v: string) => {
    const s = (v ?? "").replace(/[\r\n]+/g, " ");
    return s.includes(";") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const buildPayload = () => rowDrafts.map((d, i) => ({
    empfaengertyp,
    name: d.name.trim(),
    land: land.trim().toUpperCase().slice(0, 2) || "DE",
    iban: cleanIban(d.iban),
    betrag: d.betrag,
    referenz: d.referenz.trim() || rows[i]?.description || "",
  }));

  const buildCsvContent = (payload: ReturnType<typeof buildPayload>) => {
    const lines = payload.map(r =>
      [r.empfaengertyp, r.name, r.land, r.iban, r.betrag, r.referenz].map(esc).join(";")
    );
    return [UIW_HEADER, ...lines].join("\n");
  };

  const validate = () => {
    const missing = rowDrafts.findIndex(d => !d.name.trim() || !cleanIban(d.iban));
    if (missing !== -1) {
      toast({ title: `Zeile ${missing + 1}: Name oder IBAN fehlt`, variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleDownload = () => {
    if (!validate()) return;
    const payload = buildPayload();
    const csv = buildCsvContent(payload);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `UIW_${timestamp}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Download gestartet", description: filename });
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = buildPayload();

      const res = await fetch(`/api/sumup/uiw-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json() as { success: boolean; message: string; filename?: string };
      if (!data.success) throw new Error(data.message);

      toast({ title: "UIW gespeichert", description: data.message });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Fehler beim Speichern", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5" />
            UIW-Überweisung erstellen
          </DialogTitle>
          <DialogDescription>
            {isSingle
              ? "Empfängerdaten eingeben und als UIW.csv in Dropbox speichern."
              : `${rows.length} Transaktionen ausgewählt — Empfänger pro Zeile eingeben oder gemeinsam übernehmen.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Empfängertyp + Land (gilt für alle Zeilen) */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Allgemein</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Empfängertyp</Label>
                <Select value={empfaengertyp} onValueChange={v => setEmpfaengertyp(v as "Privatperson" | "Geschäft")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Privatperson">Privatperson</SelectItem>
                    <SelectItem value="Geschäft">Geschäft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Land (2-stellig)</Label>
                <Input
                  value={land}
                  onChange={e => setLand(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="DE"
                  maxLength={2}
                  className="font-mono uppercase"
                />
              </div>
            </div>
          </div>

          {/* Schnellausfüllen: gleicher Empfänger für alle Zeilen */}
          {!isSingle && (
            <>
              <Separator />
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Gleicher Empfänger für alle Zeilen
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {empfaengertyp === "Privatperson" ? "Name" : "Geschäftsname"}
                    </Label>
                    <Input
                      value={sharedName}
                      onChange={e => setSharedName(e.target.value)}
                      placeholder={empfaengertyp === "Privatperson" ? "Julia Schumann" : "Evas Keksfabrik GmbH"}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">IBAN</Label>
                    <Input
                      value={sharedIban}
                      onChange={e => setSharedIban(e.target.value.replace(/[^A-Za-z0-9 ]/g, "").toUpperCase())}
                      placeholder="DE00 0000 0000 0000 0000 00"
                      className="h-8 text-sm font-mono tracking-wider"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={applyToAll}
                  disabled={!sharedName.trim() && !sharedIban.trim()}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                  Auf alle Zeilen anwenden
                </Button>
              </div>
            </>
          )}

          <Separator />

          {/* Pro Zeile: Empfänger + Betrag + Referenz */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isSingle ? "Empfänger & Transaktion" : `Zeilen (${rows.length})`}
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={row.transactionId} className={`rounded-md border p-3 space-y-2 ${!isSingle ? "bg-muted/30" : ""}`}>
                  {!isSingle && (
                    <div className="text-xs text-muted-foreground truncate" title={row.description}>
                      {idx + 1}. {row.description}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {empfaengertyp === "Privatperson" ? "Name" : "Geschäftsname"}
                      </Label>
                      <Input
                        value={rowDrafts[idx]?.name ?? ""}
                        onChange={e => updateDraft(idx, "name", e.target.value)}
                        className="h-8 text-sm"
                        placeholder={empfaengertyp === "Privatperson" ? "Julia Schumann" : "Evas Keksfabrik GmbH"}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">IBAN</Label>
                      <Input
                        value={rowDrafts[idx]?.iban ?? ""}
                        onChange={e => updateDraft(idx, "iban", e.target.value.replace(/[^A-Za-z0-9 ]/g, "").toUpperCase())}
                        className="h-8 text-sm font-mono tracking-wider"
                        placeholder="DE00 0000 0000 0000 0000 00"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Betrag (EUR)</Label>
                      <Input
                        value={rowDrafts[idx]?.betrag ?? ""}
                        onChange={e => updateDraft(idx, "betrag", e.target.value)}
                        className="font-mono h-8 text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Referenz (optional)</Label>
                      <Input
                        value={rowDrafts[idx]?.referenz ?? ""}
                        onChange={e => updateDraft(idx, "referenz", e.target.value)}
                        className="h-8 text-sm"
                        placeholder="Rechnung Nr. ..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <FileDown className="w-3.5 h-3.5 shrink-0" />
            Dateiname: <code className="font-mono mx-1">UIW_YYYYMMDD_HHMM.csv</code> — direkt herunterladen oder in Dropbox speichern.
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button variant="secondary" onClick={handleDownload} disabled={saving}>
            <Download className="w-4 h-4 mr-1.5" />
            Herunterladen
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Landmark className="w-4 h-4 mr-1.5" />}
            In Dropbox speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
