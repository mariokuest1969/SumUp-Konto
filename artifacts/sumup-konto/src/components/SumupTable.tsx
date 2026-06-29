import React, { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSumupTransactions,
  getListSumupTransactionsQueryKey,
  useGetSumupColumns,
  useUpdateSumupTransaction,
  useDeleteSumupTransaction,
  useBulkDeleteSumupTransactions,
  useGetSumupStats,
  ListSumupTransactionsSortDir
} from "@workspace/api-client-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Search, X } from "lucide-react";

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

  const handleSort = (col: string) => {
    if (sortKey === col) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (sortDir === "desc") {
        setSortKey(undefined);
        setSortDir(undefined);
      } else {
        setSortDir("asc");
      }
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const handleFilterChange = (col: string, val: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [col]: val
    }));
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
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSumupTransactionsQueryKey() });
          setSelectedIds(new Set());
          toast({ title: "Erfolgreich gelöscht" });
        },
        onError: () => {
          toast({ title: "Fehler beim Löschen", variant: "destructive" });
        }
      }
    );
  };

  const handleDeleteRow = (id: number) => {
    if (!confirm("Eintrag wirklich löschen?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSumupTransactionsQueryKey() });
          toast({ title: "Eintrag gelöscht" });
        }
      }
    );
  };

  const handleCellUpdate = (id: number, col: string, newValue: string, oldValue: string) => {
    if (newValue === oldValue) return;
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    const newData = { ...tx.data, [col]: newValue };
    updateMutation.mutate(
      { id, data: { data: newData } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSumupTransactionsQueryKey() });
        },
        onError: () => {
          toast({ title: "Fehler beim Speichern", variant: "destructive" });
        }
      }
    );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {selectedIds.size} löschen
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 w-[40px]">
                  <Checkbox 
                    checked={transactions.length > 0 && selectedIds.size === transactions.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 w-[40px]"></th>
                {columns.map(col => (
                  <th key={col} className="px-4 py-2 font-medium">
                    <div className="flex flex-col gap-2 min-w-[120px]">
                      <button 
                        className="flex items-center gap-1 hover:text-foreground transition-colors group"
                        onClick={() => handleSort(col)}
                      >
                        <span className="truncate" title={col}>{col}</span>
                        {sortKey === col ? (
                          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                        )}
                      </button>
                      <Input 
                        placeholder="Filtern..." 
                        className="h-7 text-xs px-2"
                        value={columnFilters[col] || ""}
                        onChange={(e) => handleFilterChange(col, e.target.value)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoadingTransactions ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-12 text-center text-muted-foreground">
                    Keine Transaktionen gefunden
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-2">
                      <Checkbox 
                        checked={selectedIds.has(tx.id)}
                        onCheckedChange={() => toggleSelectRow(tx.id)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button 
                        onClick={() => handleDeleteRow(tx.id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Zeile löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                    {columns.map(col => (
                      <td key={`${tx.id}-${col}`} className="px-4 py-2 align-top">
                        <EditableCell 
                          value={tx.data[col] || ""} 
                          onSave={(newVal) => handleCellUpdate(tx.id, col, newVal, tx.data[col] || "")} 
                        />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function EditableCell({ value, onSave }: { value: string; onSave: (val: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    setIsEditing(false);
    onSave(currentValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setCurrentValue(value);
      setIsEditing(false);
    }
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
      className="min-h-[28px] flex items-center px-2 hover:bg-muted/50 rounded cursor-text border border-transparent hover:border-border font-mono text-sm whitespace-nowrap"
      onClick={() => setIsEditing(true)}
      title={value}
    >
      {value || <span className="opacity-0">-</span>}
    </div>
  );
}
