import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListVouchers, 
  getListVouchersQueryKey,
  useSyncFromDropbox,
  useExportToDropbox,
  useGetVoucherStats
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Plus, Search } from "lucide-react";
import { VoucherTable } from "@/components/VoucherTable";
import { VoucherStats } from "@/components/VoucherStats";
import { VoucherDialog } from "@/components/VoucherDialog";

export default function Home() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: vouchers, isLoading } = useListVouchers(
    { search: search || undefined }, 
    { query: { queryKey: getListVouchersQueryKey({ search: search || undefined }) } }
  );

  const { data: stats, isLoading: statsLoading } = useGetVoucherStats();

  const syncMutation = useSyncFromDropbox({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Synchronisierung erfolgreich",
          description: res.message,
        });
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["/api/vouchers/stats"] });
      },
      onError: (err: any) => {
        toast({
          title: "Fehler",
          description: err.message || "Synchronisierung fehlgeschlagen",
          variant: "destructive",
        });
      }
    }
  });

  const exportMutation = useExportToDropbox({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Export erfolgreich",
          description: res.message,
        });
      },
      onError: (err: any) => {
        toast({
          title: "Fehler",
          description: err.message || "Export fehlgeschlagen",
          variant: "destructive",
        });
      }
    }
  });

  return (
    <div className="min-h-[100dvh] w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Voucher.Kasse</h1>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Dropbox Sync
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className="w-4 h-4 mr-2" />
            CSV Export
          </Button>
        </div>
      </div>

      <VoucherStats stats={stats} isLoading={statsLoading} />

      <div className="flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Gutscheinnummer suchen..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Gutschein anlegen
        </Button>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <VoucherTable vouchers={vouchers || []} isLoading={isLoading} />
      </div>

      <VoucherDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
      />
    </div>
  );
}
