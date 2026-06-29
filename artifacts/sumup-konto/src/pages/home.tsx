import { useQueryClient } from "@tanstack/react-query";
import {
  useImportSumupFromDropbox,
  useExportSumupToDropbox,
  getGetSumupStatsQueryKey,
  getListSumupTransactionsQueryKey,
  getGetSumupColumnsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { SumupTable } from "@/components/SumupTable";
import { SumupStatsCard } from "@/components/SumupStatsCard";
import { useToast } from "@/hooks/use-toast";
import { CloudDownload, CloudUpload, Loader2 } from "lucide-react";

export default function Home() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importMutation = useImportSumupFromDropbox();
  const exportMutation = useExportSumupToDropbox();

  const handleImport = () => {
    importMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Import erfolgreich",
          description: data.message || `${data.recordsImported} Datensätze verarbeitet.`,
        });
        queryClient.invalidateQueries({ queryKey: getGetSumupStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSumupTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSumupColumnsQueryKey() });
      },
      onError: (error: any) => {
        toast({
          title: "Import fehlgeschlagen",
          description: error?.message || "Ein unerwarteter Fehler ist aufgetreten.",
          variant: "destructive",
        });
      },
    });
  };

  const handleExport = () => {
    exportMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: "Export erfolgreich",
          description: data.message || `Daten wurden nach Dropbox exportiert.`,
        });
      },
      onError: (error: any) => {
        toast({
          title: "Export fehlgeschlagen",
          description: error?.message || "Ein unerwarteter Fehler ist aufgetreten.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded flex items-center justify-center font-bold text-lg">
              S
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">SumUp Konto</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="gap-2"
            >
              {importMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              Aus Dropbox importieren
            </Button>
            <Button
              onClick={handleExport}
              disabled={exportMutation.isPending}
              className="gap-2"
            >
              {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              Nach Dropbox exportieren
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section>
          <SumupStatsCard />
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Transaktionen</h2>
            <p className="text-sm text-muted-foreground">Verwalten und filtern Sie Ihre SumUp-Umsätze.</p>
          </div>
          <SumupTable />
        </section>
      </main>
    </div>
  );
}
