import { format } from "date-fns";
import { de } from "date-fns/locale";

export function formatEuro(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0,00 €";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd.MM.yyyy HH:mm", { locale: de });
  } catch (e) {
    return dateStr;
  }
}
