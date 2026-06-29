import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSumupTransactions,
  getListSumupTransactionsQueryKey,
  useGetSumupColumns,
  useUpdateSumupTransaction,
  useDeleteSumupTransaction,
  useBulkDeleteSumupTransactions,
  useBulkNoteSumupTransactions,
  useGetSumupStats,
  getGetSumupStatsQueryKey,
  ListSumupTransactionsSortDir,
} from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Search, X, StickyNote, Landmark, Columns3, ChevronUp, ChevronDown } from "lucide-react";
import { SumupUIWDialog, UIWDialogRow } from "@/components/SumupUIWDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const BETRAG_KEYS = ["Betrag", "Bruttoertrag", "Transaktionsbetrag", "Bruttobetrag"];
const DATE_KEYS = ["Datum der Transaktion", "Datum", "Date", "Transaktionsdatum"];

function extractBetrag(data: Record<string, string>): string {
  const key = BETRAG_KEYS.find(k => k in data);
  if (!key) return "0.00";
  const raw = data[key].replace(",", ".").replace(/[^\d.\-]/g, "");
  const num = parseFloat(raw) || 0;
  return Math.abs(num).toFixed(2);
}

function extractDescription(data: Record<string, string>): string {
  const dateKey = DATE_KEYS.find(k => k in data);
  const others = Object.entries(data)
    .filter(([k]) => !DATE_KEYS.includes(k) && !BETRAG_KEYS.includes(k))
    .slice(0, 2)
    .map(([, v]) => v)
    .filter(Boolean);
  const parts = dateKey ? [data[dateKey], ...others] : others;
  return parts.join(" · ").slice(0, 80) || "Transaktion";
}

export function SumupTable() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [sortKey, setSortKey] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<ListSumupTransactionsSortDir | undefined>();

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const debouncedColumnFilters = useDebounce(columnFilters, 500);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkNoteText, setBulkNoteText] = useState("");
  const [showBulkNote, setShowBulkNote] = useState(false);

  const [uiwOpen, setUiwOpen] = useState(false);
  const [uiwRows, setUiwRows] = useState<UIWDialogRow[]>([]);

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("sumup-hidden-columns");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleColumn = (col: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      localStorage.setItem("sumup-hidden-columns", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("sumup-column-order");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const moveColumn = (col: string, dir: -1 | 1, base: string[]) => {
    setColumnOrder(prev => {
      const current = prev.length ? prev : base;
      const idx = current.indexOf(col);
      if (idx === -1) return current;
      const next = [...current];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return current;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      localStorage.setItem("sumup-column-order", JSON.stringify(next));
      return next;
    });
  };

  const filtersString = React.useMemo(() => {
    const activeFilters = Object.fromEntries(
      Object.entries(debouncedColumnFilters).filter(([_, v]) => v.trim() !== "")
    );
    if (Object.keys(activeFilters).length === 0) return undefined;
    return JSON.stringify(activeFilters);
  }, [debouncedColumnFilters]);

  const { data: columns = [], isLoading: isLoadingColumns } = useGetSumupColumns();
  const queryParams = {
    search: debouncedSearch || undefined,
    sortKey,
    sortDir,
    filters: filtersString,
  };
  const { data: transactions = [], isLoading: isLoadingTransactions } = useListSumupTransactions(queryParams);
  const { data: stats } = useGetSumupStats();

  const updateMutation = useUpdateSumupTransaction();
  const deleteMutation = useDeleteSumupTransaction();
  const bulkDeleteMutation = useBulkDeleteSumupTransactions();
  const bulkNoteMutation = useBulkNoteSumupTransactions();

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListSumupTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSumupStatsQueryKey() });
  }, [queryClient]);

  const handleSort = (col: string) => {
    if (sortKey === col) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(undefined); setSortDir(undefined); }
      else setSortDir("asc");
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const handleFilterChange = (col: string, val: string) => {
    setColumnFilters(prev => ({ ...prev, [col]: val }));
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length && transactions.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(t => t.id)));
    }
  };

  const toggleSelectRow = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Sind Sie sicher, dass Sie ${selectedIds.size} Einträge löschen möchten?`)) return;
    bulkDeleteMutation.mutate(
      { data: { ids: Array.from(selectedIds) } },
      {
        onSuccess: () => { invalidateAll(); setSelectedIds(new Set()); toast({ title: "Erfolgreich gelöscht" }); },
        onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
      }
    );
  };

  const handleBulkNote = () => {
    if (selectedIds.size === 0) return;
    bulkNoteMutation.mutate(
      { data: { ids: Array.from(selectedIds), notiz: bulkNoteText } },
      {
        onSuccess: (result) => {
          invalidateAll();
          toast({ title: `Notiz für ${result.updated ?? selectedIds.size} Einträge gesetzt` });
          setShowBulkNote(false);
          setBulkNoteText("");
          setSelectedIds(new Set());
        },
        onError: () => toast({ title: "Fehler beim Setzen der Notiz", variant: "destructive" }),
      }
    );
  };

  const openUIWForRow = (tx: { id: number; data: Record<string, string>; notiz?: string | null }) => {
    setUiwRows([{ transactionId: tx.id, betrag: extractBetrag(tx.data), description: extractDescription(tx.data), notiz: tx.notiz ?? "" }]);
    setUiwOpen(true);
  };

  const openUIWForSelected = () => {
    const rows: UIWDialogRow[] = transactions
      .filter(tx => selectedIds.has(tx.id))
      .map(tx => ({ transactionId: tx.id, betrag: extractBetrag(tx.data), description: extractDescription(tx.data), notiz: tx.notiz ?? "" }));
    if (!rows.length) return;
    setUiwRows(rows);
    setUiwOpen(true);
  };

  const handleDeleteRow = (id: number) => {
    if (!confirm("Eintrag wirklich löschen?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => { invalidateAll(); toast({ title: "Eintrag gelöscht" }); },
    });
  };

  const handleCellUpdate = (id: number, col: string, newValue: string, oldValue: string) => {
    if (newValue === oldValue) return;
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    const newData = { ...tx.data, [col]: newValue };
    updateMutation.mutate({ id, data: { data: newData } }, {
      onSuccess: () => invalidateAll(),
      onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
    });
  };

  const handleNotizUpdate = (id: number, notiz: string, oldNotiz: string) => {
    if (notiz === oldNotiz) return;
    updateMutation.mutate({ id, data: { notiz: notiz || null } }, {
      onSuccess: () => invalidateAll(),
      onError: () => toast({ title: "Fehler beim Speichern der Notiz", variant: "destructive" }),
    });
  };

  if (!isLoadingColumns && columns.length === 0 && (!stats || stats.total === 0)) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg bg-card text-muted-foreground border-dashed">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="w-8 h-8 opacity-50" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Keine Transaktionen vorhanden</h3>
        <p className="mt-2 text-sm max-w-sm">
          Bitte importieren Sie Ihre SumUp-Daten aus Dropbox, um sie hier anzeigen und bearbeiten zu können.
        </p>
      </div>
    );
  }

  const sortedColumns = React.useMemo(() => {
    if (!columnOrder.length) return columns;
    const inOrder = columnOrder.filter(c => columns.includes(c));
    const rest = columns.filter(c => !columnOrder.includes(c));
    return [...inOrder, ...rest];
  }, [columns, columnOrder]);

  const visibleColumns = sortedColumns.filter(col => !hiddenColumns.has(col));
  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Globale Suche..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {columns.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Columns3 className="w-4 h-4" />
                  Spalten
                  {hiddenColumns.size > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 leading-none">
                      {hiddenColumns.size}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Spalten & Reihenfolge</p>
                <div className="space-y-0.5 max-h-80 overflow-y-auto">
                  {sortedColumns.map((col, idx) => (
                    <div key={col} className="flex items-center gap-1 px-1 py-1 rounded hover:bg-muted group">
                      <div className="flex flex-col">
                        <button
                          className="p-0.5 rounded hover:bg-muted-foreground/20 disabled:opacity-20"
                          disabled={idx === 0}
                          onClick={() => moveColumn(col, -1, sortedColumns)}
                          title="Nach oben"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          className="p-0.5 rounded hover:bg-muted-foreground/20 disabled:opacity-20"
                          disabled={idx === sortedColumns.length - 1}
                          onClick={() => moveColumn(col, 1, sortedColumns)}
                          title="Nach unten"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm min-w-0">
                        <Checkbox
                          checked={!hiddenColumns.has(col)}
                          onCheckedChange={() => toggleColumn(col)}
                        />
                        <span className="truncate">{col}</span>
                      </label>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2 border-t pt-2">
                  {hiddenColumns.size > 0 && (
                    <button
                      className="flex-1 text-xs text-center text-muted-foreground hover:text-foreground py-1"
                      onClick={() => { setHiddenColumns(new Set()); localStorage.removeItem("sumup-hidden-columns"); }}
                    >
                      Alle einblenden
                    </button>
                  )}
                  {columnOrder.length > 0 && (
                    <button
                      className="flex-1 text-xs text-center text-muted-foreground hover:text-foreground py-1"
                      onClick={() => { setColumnOrder([]); localStorage.removeItem("sumup-column-order"); }}
                    >
                      Reihenfolge zurücksetzen
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">{selectedIds.size} ausgewählt</span>
              <Button
                variant="outline"
                size="sm"
                onClick={openUIWForSelected}
              >
                <Landmark className="w-4 h-4 mr-1.5" />
                UIW erstellen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setShowBulkNote(!showBulkNote); setBulkNoteText(""); }}
              >
                <StickyNote className="w-4 h-4 mr-1.5" />
                Notiz setzen
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  : <Trash2 className="w-4 h-4 mr-1.5" />}
                {selectedIds.size} löschen
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Auswahl aufheben
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Bulk-Notiz Panel */}
      {showBulkNote && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted/40 border rounded-lg">
          <StickyNote className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground shrink-0">Notiz für {selectedIds.size} Einträge:</span>
          <Input
            placeholder="z.B. Bareinzahlung, Kreditkartenzahlung, ..."
            value={bulkNoteText}
            onChange={(e) => setBulkNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBulkNote(); }}
            className="flex-1"
            autoFocus
          />
          <Button size="sm" onClick={handleBulkNote} disabled={bulkNoteMutation.isPending}>
            {bulkNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Speichern"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowBulkNote(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
              <tr>
                <th className="px-3 py-3 w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                </th>
                <th className="px-3 py-3 w-[40px]" />
                {visibleColumns.map(col => (
                  <th key={col} className="px-3 py-2 font-medium">
                    <div className="flex flex-col gap-1.5 min-w-[110px]">
                      <button
                        className="flex items-center gap-1 hover:text-foreground transition-colors group text-left"
                        onClick={() => handleSort(col)}
                      >
                        <span className="truncate" title={col}>{col}</span>
                        {sortKey === col
                          ? sortDir === "asc" ? <ArrowUp className="w-3 h-3 shrink-0" /> : <ArrowDown className="w-3 h-3 shrink-0" />
                          : <ArrowUpDown className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50" />}
                      </button>
                      <Input
                        placeholder="Filtern..."
                        className="h-6 text-xs px-1.5"
                        value={columnFilters[col] || ""}
                        onChange={(e) => handleFilterChange(col, e.target.value)}
                      />
                    </div>
                  </th>
                ))}
                {/* Notiz column */}
                <th className="px-3 py-2 font-medium min-w-[180px]">
                  <div className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-1">
                      <StickyNote className="w-3 h-3" />
                      Notiz
                    </span>
                    <Input
                      placeholder="Filtern..."
                      className="h-6 text-xs px-1.5"
                      value={columnFilters["__notiz__"] || ""}
                      onChange={(e) => handleFilterChange("__notiz__", e.target.value)}
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoadingTransactions ? (
                <tr>
                  <td colSpan={visibleColumns.length + 3} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 3} className="px-4 py-12 text-center text-muted-foreground">
                    Keine Transaktionen gefunden
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className={`hover:bg-muted/30 transition-colors group ${selectedIds.has(tx.id) ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={selectedIds.has(tx.id)}
                        onCheckedChange={() => toggleSelectRow(tx.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openUIWForRow(tx)}
                          className="text-muted-foreground hover:text-primary"
                          title="UIW-Überweisung erstellen"
                        >
                          <Landmark className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(tx.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title="Zeile löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                    {visibleColumns.map(col => (
                      <td key={`${tx.id}-${col}`} className="px-3 py-2 align-top">
                        <EditableCell
                          value={tx.data[col] || ""}
                          onSave={(v) => handleCellUpdate(tx.id, col, v, tx.data[col] || "")}
                        />
                      </td>
                    ))}
                    {/* Notiz cell — always-visible inline input */}
                    <td className="px-3 py-1.5 align-top" onClick={(e) => e.stopPropagation()}>
                      <NoteCell
                        value={tx.notiz ?? ""}
                        onSave={(v) => handleNotizUpdate(tx.id, v, tx.notiz ?? "")}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground text-right">
        {transactions.length} Einträge angezeigt
      </div>

      <SumupUIWDialog open={uiwOpen} onOpenChange={setUiwOpen} rows={uiwRows} />
    </div>
  );
}

function EditableCell({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCurrentValue(value); }, [value]);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  const handleSave = () => { setIsEditing(false); onSave(currentValue); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setCurrentValue(value); setIsEditing(false); }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 text-xs px-2 min-w-[100px] bg-background font-mono"
      />
    );
  }

  return (
    <div
      className="min-h-[28px] flex items-center px-2 hover:bg-muted/50 rounded cursor-text border border-transparent hover:border-border font-mono text-xs whitespace-nowrap"
      onClick={() => setIsEditing(true)}
      title={value}
    >
      {value || <span className="opacity-0">-</span>}
    </div>
  );
}

function NoteCell({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setDraft(value); }, [value]);

  const triggerSave = useCallback((val: string) => {
    onSave(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }, [onSave]);

  const handleChange = (val: string) => {
    setDraft(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => triggerSave(val), 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (timerRef.current) clearTimeout(timerRef.current);
      triggerSave(draft);
    }
  };

  return (
    <div className="relative flex items-center">
      <Input
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Notiz..."
        className="h-7 text-xs pr-6 min-w-[160px]"
      />
      {saved && (
        <span className="absolute right-2 text-emerald-500 text-xs font-medium pointer-events-none">
          ✓
        </span>
      )}
    </div>
  );
}
