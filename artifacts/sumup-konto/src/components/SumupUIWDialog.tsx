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
import { Loader2, Landmark, FileDown } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

export interface UIWDialogRow {
  transactionId: number;
  betrag: string;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: UIWDialogRow[];
}

interface RowDraft {
  betrag: string;
  referenz: string;
}

export function SumupUIWDialog({ open, onOpenChange, rows }: Props) {
  const { toast } = useToast();
  const [empfaengertyp, setEmpfaengertyp] = useState<"Privatperson" | "Geschäft">("Privatperson");
  const [name, setName] = useState("");
  const [land, setLand] = useState("DE");
  const [iban, setIban] = useState("");
  const [rowDrafts, setRowDrafts] = useState<RowDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRowDrafts(rows.map(r => ({ betrag: r.betrag, referenz: "" })));
  }, [open, rows]);

  const isSingle = rows.length === 1;

  const updateDraft = (idx: number, field: keyof RowDraft, val: string) => {
    setRowDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Name fehlt", variant: "destructive" }); return; }
    const ibanClean = iban.replace(/\s+/g, "");
    if (!ibanClean) { toast({ title: "IBAN fehlt", variant: "destructive" }); return; }

    setSaving(true);
    try {
      const payload = rowDrafts.map((d, i) => ({
        empfaengertyp,
        name: name.trim(),
        land: land.trim().toUpperCase().slice(0, 2) || "DE",
        iban: ibanClean,
        betrag: d.betrag,
        referenz: d.referenz.trim() || rows[i]?.description || "",
      }));

      const res = await fetch(`${BASE}api/sumup/uiw-export`, {
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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5" />
            UIW-Überweisung erstellen
          </DialogTitle>
          <DialogDescription>
            {isSingle
              ? "Empfängerdaten eingeben und als UIW.csv in Dropbox speichern."
              : `Gemeinsame Empfängerdaten für ${rows.length} Transaktionen eingeben.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Shared recipient fields */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empfänger</div>

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

            <div className="space-y-1.5">
              <Label>
                {empfaengertyp === "Privatperson" ? "Name (Vorname Nachname)" : "Geschäftsname"}
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={empfaengertyp === "Privatperson" ? "Julia Schumann" : "Evas Keksfabrik GmbH"}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>IBAN</Label>
              <Input
                value={iban}
                onChange={e => setIban(e.target.value.replace(/[^A-Z0-9a-z ]/g, "").toUpperCase())}
                placeholder="DE00 0000 0000 0000 0000 00"
                className="font-mono tracking-wider"
              />
            </div>
          </div>

          <Separator />

          {/* Per-row betrag + referenz */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {isSingle ? "Transaktion" : `Transaktionen (${rows.length})`}
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={row.transactionId} className={`rounded-md border p-3 space-y-2 ${rows.length > 1 ? "bg-muted/30" : ""}`}>
                  {rows.length > 1 && (
                    <div className="text-xs text-muted-foreground truncate" title={row.description}>
                      {row.description}
                    </div>
                  )}
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
            Wird als <code className="font-mono mx-1">UIW_YYYYMMDD_HHMM.csv</code> ohne BOM in den Dropbox-Export-Pfad gespeichert.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !iban.trim()}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Landmark className="w-4 h-4 mr-1.5" />}
            In Dropbox speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
