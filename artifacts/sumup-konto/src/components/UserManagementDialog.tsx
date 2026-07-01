import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Ban, CheckCircle2, Users, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ClerkUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  banned: boolean;
  locked: boolean;
  createdAt: number;
  lastSignInAt: number | null;
  imageUrl: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function UserManagementDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<ClerkUser | null>(null);

  const { data, isLoading, error } = useQuery<{ users: ClerkUser[]; requestingUserId: string }>({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch("/api/admin/users"),
    enabled: open,
    staleTime: 0,
  });

  const banMutation = useMutation({
    mutationFn: (user: ClerkUser) =>
      apiFetch(`/api/admin/users/${user.id}/${user.banned ? "unban" : "ban"}`, { method: "PATCH" }),
    onSuccess: (_, user) => {
      toast({ title: user.banned ? "Zugang wiederhergestellt" : "Zugang gesperrt" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Benutzer gelöscht" });
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const requestingUserId = data?.requestingUserId;
  const users = data?.users ?? [];

  function formatDate(ts: number | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-muted-foreground" />
              Benutzerverwaltung
            </DialogTitle>
            <DialogDescription>
              Zugänge verwalten — sperren, entsperren oder löschen.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-4 py-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Fehler beim Laden: {(error as any).message}
              </div>
            )}

            {!isLoading && !error && users.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">Keine Benutzer vorhanden.</p>
            )}

            {!isLoading && users.length > 0 && (
              <div className="divide-y divide-border rounded-md border overflow-hidden">
                {users.map((user) => {
                  const isSelf = user.id === requestingUserId;
                  const isBanning = banMutation.isPending && banMutation.variables?.id === user.id;
                  const isDeleting = deleteMutation.isPending && deleteMutation.variables === user.id;
                  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "—";

                  return (
                    <div key={user.id} className="flex items-center gap-3 px-4 py-3 bg-card">
                      {user.imageUrl ? (
                        <img src={user.imageUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                          {user.email[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground truncate">{fullName}</span>
                          {isSelf && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0">Sie</Badge>
                          )}
                          {user.banned && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0">Gesperrt</Badge>
                          )}
                          {user.locked && !user.banned && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">Gesichert</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Registriert: {formatDate(user.createdAt)} · Letzter Login: {formatDate(user.lastSignInAt)}
                        </p>
                      </div>

                      {!isSelf && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant={user.banned ? "outline" : "ghost"}
                            size="sm"
                            className={user.banned ? "text-emerald-600 border-emerald-200 hover:bg-emerald-50" : "text-amber-600 hover:bg-amber-50 hover:text-amber-700"}
                            onClick={() => banMutation.mutate(user)}
                            disabled={isBanning || isDeleting}
                            title={user.banned ? "Zugang entsperren" : "Zugang sperren"}
                          >
                            {isBanning ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : user.banned ? (
                              <><CheckCircle2 className="w-4 h-4 mr-1" /> Entsperren</>
                            ) : (
                              <><Ban className="w-4 h-4 mr-1" /> Sperren</>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setConfirmDelete(user)}
                            disabled={isBanning || isDeleting}
                            title="Benutzer löschen"
                          >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Benutzer wirklich löschen?
            </DialogTitle>
            <DialogDescription>
              Das Konto von <strong>{confirmDelete?.email}</strong> wird dauerhaft gelöscht und kann nicht wiederhergestellt werden.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Endgültig löschen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
