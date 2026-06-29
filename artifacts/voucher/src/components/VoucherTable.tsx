import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Voucher } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2, ArrowUpDown, ArrowUp, ArrowDown, X, Check } from "lucide-react";
import {
  useDeleteVoucher,
  useBulkDeleteVouchers,
  useUpdateVoucher,
  getListVouchersQueryKey,
  getGetVoucherStatsQueryKey,
  type BulkDeleteRequest,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { VoucherDialog } from "./VoucherDialog";

function NoteCell({ voucher }: { voucher: Voucher }) {
  const [value, setValue] = useState(voucher.notiz ?? "");
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const updateMutation = useUpdateVoucher({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      },
    },
  });

  useEffect(() => {
    setValue(voucher.notiz ?? "");
  }, [voucher.notiz]);

  const scheduleS = useCallback(
    (val: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        updateMutation.mutate({ id: voucher.id, data: { notiz: val || null } });
      }, 800);
    },
    [voucher.id],
  );

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="relative flex items-center">
      <input
        className="w-full min-w-[160px] border border-border rounded px-2 py-1 text-sm bg-background placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
        value={value}
        placeholder="Notiz..."
        onChange={(e) => {
          setValue(e.target.value);
          scheduleS(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (timerRef.current) clearTimeout(timerRef.current);
            updateMutation.mutate({ id: voucher.id, data: { notiz: value || null } });
          }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        title={value || "Notiz hinzufügen..."}
      />
      {saved && (
        <Check className="absolute right-1.5 w-3 h-3 text-green-500 pointer-events-none" />
      )}
    </div>
  );
}

type SortKey = "gutscheinnummer" | "betrag" | "key" | "ausstellungsdatum" | "einloesung1" | "einloesung2" | "einloesung3" | "notiz";
type SortDir = "asc" | "desc";

type QuickFilter =
  | "betrag_null"
  | "betrag_pos"
  | "nicht_eingeloest"
  | "eingeloest"
  | "kein_datum"
  | "key_6";

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "betrag_null", label: "Betrag = 0" },
  { id: "betrag_pos", label: "Betrag > 0" },
  { id: "nicht_eingeloest", label: "Offen" },
  { id: "eingeloest", label: "Eingelöst" },
  { id: "kein_datum", label: "Kein Ausstellungsdatum" },
  { id: "key_6", label: "Key = 6" },
];

interface Props {
  vouchers: Voucher[];
  isLoading: boolean;
}

export function VoucherTable({ vouchers, isLoading }: Props) {
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "gutscheinnummer", dir: "asc" });
  const [activeFilters, setActiveFilters] = useState<Set<QuickFilter>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteMutation = useDeleteVoucher({
    mutation: {
      onSuccess: () => {
        toast({ title: "Gutschein gelöscht" });
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVoucherStatsQueryKey() });
      },
      onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
    },
  });

  const bulkDeleteMutation = useBulkDeleteVouchers({
    mutation: {
      onSuccess: (res) => {
        toast({ title: `${res.deleted} Gutscheine gelöscht` });
        setSelected(new Set());
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVoucherStatsQueryKey() });
      },
      onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
    },
  });

  const fmt = (dateStr?: string | null) => {
    if (!dateStr) return "–";
    const parts = dateStr.split(".");
    if (parts.length === 3 && parts[2].length === 4) return dateStr;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const fmtCurrency = (val: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);

  const cmpVal = (v: Voucher, key: SortKey): string | number => {
    if (key === "betrag") return v.betrag;
    if (key === "gutscheinnummer") return v.gutscheinnummer;
    const s = v[key] ?? "";
    return s;
  };

  const applyFilter = (list: Voucher[], f: QuickFilter): Voucher[] => {
    switch (f) {
      case "betrag_null": return list.filter((v) => v.betrag === 0);
      case "betrag_pos": return list.filter((v) => v.betrag > 0);
      case "nicht_eingeloest": return list.filter((v) => !v.einloesung1);
      case "eingeloest": return list.filter((v) => !!v.einloesung1);
      case "kein_datum": return list.filter((v) => !v.ausstellungsdatum);
      case "key_6": return list.filter((v) => v.key === "6");
      default: return list;
    }
  };

  const displayed = useMemo(() => {
    let list = [...vouchers];
    for (const f of activeFilters) list = applyFilter(list, f);
    list.sort((a, b) => {
      const av = cmpVal(a, sort.key);
      const bv = cmpVal(b, sort.key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [vouchers, activeFilters, sort]);

  const summary = useMemo(() => {
    const totalBetrag = displayed.reduce((s, v) => s + Number(v.betrag), 0);
    const eingeloest = displayed.filter((v) => !!v.einloesung1).length;
    const offen = displayed.filter((v) => !v.einloesung1).length;
    return { totalBetrag, eingeloest, offen };
  }, [displayed]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const toggleFilter = (f: QuickFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
    setSelected(new Set());
  };

  const allSelected =
    displayed.length > 0 && displayed.every((v) => selected.has(v.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        displayed.forEach((v) => next.delete(v.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        displayed.forEach((v) => next.add(v.id));
        return next;
      });
    }
  };

  const toggleRow = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Gutschein wirklich löschen?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selected);
    if (window.confirm(`${ids.length} Gutscheine wirklich löschen?`)) {
      bulkDeleteMutation.mutate({ data: { ids } as BulkDeleteRequest });
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sort.key !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sort.dir === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const ColHead = ({ col, label, className }: { col: SortKey; label: string; className?: string }) => (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 ${className ?? ""}`}
      onClick={() => toggleSort(col)}
    >
      <span className="flex items-center">
        {label}
        <SortIcon col={col} />
      </span>
    </TableHead>
  );

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Daten werden geladen...</div>;
  }

  return (
    <div>
      {/* Quick-filter chips */}
      <div className="flex flex-wrap gap-2 p-4 border-b bg-muted/20">
        <span className="text-xs text-muted-foreground self-center mr-1">Filter:</span>
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => toggleFilter(f.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
              ${activeFilters.has(f.id)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted"}`}
          >
            {f.label}
            {activeFilters.has(f.id) && <X className="w-3 h-3" />}
          </button>
        ))}
        {activeFilters.size > 0 && (
          <button
            onClick={() => { setActiveFilters(new Set()); setSelected(new Set()); }}
            className="text-xs text-muted-foreground underline self-center"
          >
            Alle zurücksetzen
          </button>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>{displayed.length} von {vouchers.length} Einträge</span>
          <span className="font-medium text-foreground">{fmtCurrency(summary.totalBetrag)}</span>
          <span className="text-green-600">✓ {summary.eingeloest} eingelöst</span>
          <span className="text-orange-500">○ {summary.offen} offen</span>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-destructive/10 border-b">
          <span className="text-sm font-medium">{selected.size} ausgewählt</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {bulkDeleteMutation.isPending ? "Löschen..." : `${selected.size} löschen`}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Auswahl aufheben
          </Button>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          Keine Gutscheine gefunden.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Alle auswählen"
                />
              </TableHead>
              <ColHead col="gutscheinnummer" label="Gutscheinnummer" className="w-[160px]" />
              <ColHead col="betrag" label="Betrag" />
              <ColHead col="key" label="Key" />
              <ColHead col="ausstellungsdatum" label="Ausstellungsdatum" />
              <ColHead col="einloesung1" label="Einlösung 1" />
              <ColHead col="einloesung2" label="Einlösung 2" />
              <ColHead col="einloesung3" label="Einlösung 3" />
              <ColHead col="notiz" label="Notiz" className="min-w-[160px]" />
              <TableHead className="text-right w-20">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map((v) => (
              <TableRow
                key={v.id}
                className={`cursor-pointer hover:bg-muted/50 ${selected.has(v.id) ? "bg-primary/5" : ""}`}
                onClick={() => toggleRow(v.id)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(v.id)}
                    onCheckedChange={() => toggleRow(v.id)}
                    aria-label={`Gutschein ${v.gutscheinnummer} auswählen`}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm font-medium">{v.gutscheinnummer}</TableCell>
                <TableCell>{fmtCurrency(v.betrag)}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{v.key}</TableCell>
                <TableCell>{fmt(v.ausstellungsdatum)}</TableCell>
                <TableCell>{fmt(v.einloesung1)}</TableCell>
                <TableCell>{fmt(v.einloesung2)}</TableCell>
                <TableCell>{fmt(v.einloesung3)}</TableCell>
                <TableCell className="py-1.5" onClick={(e) => e.stopPropagation()}>
                  <NoteCell voucher={v} />
                </TableCell>
                <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingVoucher(v); }}>
                    <Edit2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={(e) => handleDelete(v.id, e)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-muted/40 font-medium">
              <TableCell />
              <TableCell className="text-xs text-muted-foreground">
                {displayed.length} Einträge
              </TableCell>
              <TableCell className="font-semibold">
                {fmtCurrency(summary.totalBetrag)}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-green-600 text-xs">
                ✓ {summary.eingeloest} eingelöst
              </TableCell>
              <TableCell className="text-orange-500 text-xs">
                ○ {summary.offen} offen
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <VoucherDialog
        open={!!editingVoucher}
        onOpenChange={(open) => !open && setEditingVoucher(null)}
        voucher={editingVoucher || undefined}
      />
    </div>
  );
}
