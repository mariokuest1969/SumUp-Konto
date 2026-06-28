import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { VoucherStats as VoucherStatsType } from "@workspace/api-client-react";

interface Props {
  stats?: VoucherStatsType;
  isLoading: boolean;
}

export function VoucherStats({ stats, isLoading }: Props) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground">Gesamtanzahl</p>
          <h3 className="text-2xl font-bold mt-1">{stats?.total || 0}</h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground">Gesamtwert</p>
          <h3 className="text-2xl font-bold mt-1">{formatCurrency(stats?.totalBetrag || 0)}</h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground">Eingelöst</p>
          <h3 className="text-2xl font-bold mt-1">{stats?.redeemedCount || 0}</h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm font-medium text-muted-foreground">Offen</p>
          <h3 className="text-2xl font-bold mt-1">{stats?.unredeemed || 0}</h3>
        </CardContent>
      </Card>
    </div>
  );
}
