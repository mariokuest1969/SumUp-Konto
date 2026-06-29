import { useGetSumupStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEuro, formatDate } from "@/lib/formatters";
import { Activity, Euro, Receipt, CreditCard, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function SumupStatsCard() {
  const { data: stats, isLoading } = useGetSumupStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-[120px]" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
      <div className="grid gap-4 grid-cols-5 min-w-[700px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaktionen</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Gesamtanzahl</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Betrag</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">{formatEuro(stats.totalBetrag)}</div>
            <p className="text-xs text-muted-foreground mt-1">Gesamtsumme Brutto</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gebühren</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-destructive">{formatEuro(stats.totalGebuehr)}</div>
            <p className="text-xs text-muted-foreground mt-1">SumUp Transaktionsgebühren</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Netto</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-600">{formatEuro(stats.totalNetto)}</div>
            <p className="text-xs text-muted-foreground mt-1">Auszahlungsbetrag</p>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary">Aktueller Saldo</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">
              {stats.currentSaldo !== null && stats.currentSaldo !== undefined
                ? formatEuro(stats.currentSaldo)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Letzter Kontostand</p>
          </CardContent>
        </Card>
      </div>
      </div>

      <div className="text-xs text-muted-foreground text-right">
        Letzter Import: {formatDate(stats.importedAt)}
      </div>
    </div>
  );
}
