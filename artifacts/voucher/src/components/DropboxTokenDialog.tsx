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
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Eye, EyeOff, Trash2 } from "lucide-react";

interface TokenStatus {
  set: boolean;
  masked?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DropboxTokenDialog({ open, onOpenChange }: Props) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<TokenStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setToken("");
    setShowToken(false);
    fetch("/api/settings/dropbox-token")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open]);

  const handleSave = async () => {
    if (!token.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings/dropbox-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Token gespeichert", description: "Der Dropbox-Token wurde erfolgreich aktualisiert." });
      onOpenChange(false);
    } catch {
      toast({ title: "Fehler", description: "Token konnte nicht gespeichert werden.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Token wirklich löschen? Dropbox-Funktionen nutzen dann wieder den Standard-Zugang.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings/dropbox-token", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "" }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Token gelöscht" });
      setStatus({ set: false });
      setToken("");
    } catch {
      toast({ title: "Fehler", description: "Token konnte nicht gelöscht werden.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
            Dropbox-Token ändern
          </DialogTitle>
          <DialogDescription>
            Geben Sie hier einen neuen Dropbox-API-Access-Token ein. Den Token finden Sie in der{" "}
            <a
              href="https://www.dropbox.com/developers/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary"
            >
              Dropbox App Console
            </a>{" "}
            unter „Generated access token".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {status?.set && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">
                Aktueller Token:{" "}
                <span className="font-mono text-foreground">{status.masked}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={loading}
                title="Token löschen"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="dropbox-token">Neuer Access-Token</Label>
            <div className="relative">
              <Input
                id="dropbox-token"
                type={showToken ? "text" : "password"}
                placeholder="sl.u.AAAA..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="pr-10 font-mono text-sm"
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tipp: Generieren Sie einen langlebigen Token in der App-Console oder verwenden Sie einen OAuth-2-Token.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={!token.trim() || loading}>
            {loading ? "Speichern..." : "Token speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
