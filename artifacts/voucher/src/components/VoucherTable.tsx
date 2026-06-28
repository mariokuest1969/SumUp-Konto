import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import type { Voucher } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2 } from "lucide-react";
import { useDeleteVoucher, getListVouchersQueryKey, getGetVoucherStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { VoucherDialog } from "./VoucherDialog";

interface Props {
  vouchers: Voucher[];
  isLoading: boolean;
}

export function VoucherTable({ vouchers, isLoading }: Props) {
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const deleteMutation = useDeleteVoucher({
    mutation: {
      onSuccess: () => {
        toast({ title: "Gutschein gelöscht" });
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVoucherStatsQueryKey() });
      },
      onError: () => {
        toast({ title: "Fehler beim Löschen", variant: "destructive" });
      }
    }
  });

  const handleDelete = (id: number) => {
    if (window.confirm("Gutschein wirklich löschen?")) {
      deleteMutation.mutate({ id });
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return "–";
    try {
      return format(new Date(dateStr), "dd.MM.yyyy");
    } catch {
      return "–";
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Daten werden geladen...
      </div>
    );
  }

  if (!vouchers.length) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Keine Gutscheine gefunden.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Gutscheinnummer</TableHead>
            <TableHead>Betrag</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Ausstellungsdatum</TableHead>
            <TableHead>Einlösung 1</TableHead>
            <TableHead>Einlösung 2</TableHead>
            <TableHead>Einlösung 3</TableHead>
            <TableHead className="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vouchers.map((v) => (
            <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setEditingVoucher(v)}>
              <TableCell className="font-mono text-sm font-medium">{v.gutscheinnummer}</TableCell>
              <TableCell>{formatCurrency(v.betrag)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{v.key}</TableCell>
              <TableCell>{formatDate(v.ausstellungsdatum)}</TableCell>
              <TableCell>{formatDate(v.einloesung1)}</TableCell>
              <TableCell>{formatDate(v.einloesung2)}</TableCell>
              <TableCell>{formatDate(v.einloesung3)}</TableCell>
              <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" onClick={() => setEditingVoucher(v)}>
                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <VoucherDialog 
        open={!!editingVoucher} 
        onOpenChange={(open) => !open && setEditingVoucher(null)} 
        voucher={editingVoucher || undefined}
      />
    </>
  );
}
