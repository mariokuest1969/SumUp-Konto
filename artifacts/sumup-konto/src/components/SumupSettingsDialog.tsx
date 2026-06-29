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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, FolderInput, FolderOutput, Key, CheckCircle2, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface SumupPaths { importPath: string; exportPath: string }
interface TokenStatus { set: boolean; masked?: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SumupSettingsDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();

  const [paths, setPaths] = useState<SumupPaths>({ importPath: "/Apps/roc.kasse", exportPath: "/Apps/roc.kasse" });
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>({ set: false });
  const [newToken, setNewToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [savingPaths, setSavingPaths] = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [pathsDirty, setPathsDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPathsDirty(false);
    setNewToken("");
    setShowToken(false);

    setLoadingPaths(true);
    Promise.all([
      fetch(`${BASE}api/settings/sumup-paths`).then(r => r.json()),
      fetch(`${BASE}api/settings/dropbox-token`).then(r => r.json()),
    ]).then(([p, t]) => {
      setPaths({ importPath: p.importPath ?? "/Apps/roc.kasse", exportPath: p.exportPath ?? "/Apps/roc.kasse" });
      setTokenStatus(t);
    }).catch(() => {
      toast({ title: "Fehler beim Laden der Einstellungen", variant: "destructive" });
    }).finally(() => setLoadingPaths(false));
  }, [open]);

  const handleSavePaths = async () => {
    setSavingPaths(true);
    try {
      const res = await fetch(`${BASE}api/settings/sumup-paths`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paths),
      });
      if (!res.ok) throw new Error();
      setPathsDirty(false);
      toast({ title: "Pfade gespeichert" });
    } catch {
      toast({ title: "Fehler beim Speichern der Pfade", variant: "destructive" });
    } finally {
      setSavingPaths(false);
    }
  };

  const handleSaveToken = async () => {
    if (!newToken.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch(`${BASE}api/settings/dropbox-token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: newToken.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTokenStatus({ set: true, masked: newToken.slice(0, 4) + "••••••••" + newToken.slice(-4) });
      setNewToken("");
      toast({ title: data.set ? "Token aktualisiert" : "Token gelöscht" });
    } catch {
      toast({ title: "Fehler beim Speichern des Tokens", variant: "destructive" });
    } finally {
      setSavingToken(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!confirm("Dropbox-Token wirklich löschen?")) return;
    setSavingToken(true);
    try {
      await fetch(`${BASE}api/settings/dropbox-token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "" }),
      });
      setTokenStatus({ set: false });
      toast({ title: "Token gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    } finally {
      setSavingToken(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Einstellungen</DialogTitle>
          <DialogDescription>
            Dropbox-Pfade und Token für Import / Export konfigurieren.
          </DialogDescription>
        </DialogHeader>

        {loadingPaths ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Paths section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderInput className="w-4 h-4 text-muted-foreground" />
                Dropbox-Pfade
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="import-path">Import-Pfad</Label>
                  <Input
                    id="import-path"
                    value={paths.importPath}
                    onChange={e => { setPaths(p => ({ ...p, importPath: e.target.value })); setPathsDirty(true); }}
                    placeholder="/Apps/roc.kasse"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Dropbox-Ordner, aus dem die Transaktionsbericht-CSV gelesen wird.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="export-path" className="flex items-center gap-1.5">
                    <FolderOutput className="w-3.5 h-3.5" />
                    Export-Pfad
                  </Label>
                  <Input
                    id="export-path"
                    value={paths.exportPath}
                    onChange={e => { setPaths(p => ({ ...p, exportPath: e.target.value })); setPathsDirty(true); }}
                    placeholder="/Apps/roc.kasse"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Dropbox-Ordner, in den der Export gespeichert wird.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleSavePaths}
                disabled={savingPaths || !pathsDirty}
                size="sm"
              >
                {savingPaths ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
                Pfade speichern
              </Button>
            </div>

            <Separator />

            {/* Token section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Key className="w-4 h-4 text-muted-foreground" />
                Dropbox-Token
              </div>

              {/* Current token status */}
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                tokenStatus.set
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}>
                {tokenStatus.set
                  ? <><CheckCircle2 className="w-4 h-4 shrink-0" /> Token hinterlegt: <code className="font-mono text-xs">{tokenStatus.masked}</code></>
                  : <><AlertCircle className="w-4 h-4 shrink-0" /> Kein Token hinterlegt</>
                }
              </div>

              {/* New token input */}
              <div className="space-y-1.5">
                <Label htmlFor="new-token">
                  {tokenStatus.set ? "Token erneuern" : "Token eintragen"}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="new-token"
                      type={showToken ? "text" : "password"}
                      value={newToken}
                      onChange={e => setNewToken(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveToken(); }}
                      placeholder="sl.xxxxxxxx..."
                      className="font-mono text-sm pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button onClick={handleSaveToken} disabled={savingToken || !newToken.trim()} size="sm">
                    {savingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Einen neuen Dropbox-Token erhalten Sie unter{" "}
                  <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" className="underline hover:no-underline">
                    dropbox.com/developers/apps
                  </a>.
                </p>
              </div>

              {tokenStatus.set && (
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteToken} disabled={savingToken}>
                  Token löschen
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
