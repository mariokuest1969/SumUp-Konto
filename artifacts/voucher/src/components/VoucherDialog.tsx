import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { 
  useCreateVoucher, 
  useUpdateVoucher, 
  getListVouchersQueryKey, 
  getGetVoucherStatsQueryKey,
  type Voucher 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const voucherSchema = z.object({
  gutscheinnummer: z.string().min(1, "Erforderlich"),
  betrag: z.coerce.number().min(0.01, "Muss größer als 0 sein"),
  key: z.string().min(1, "Erforderlich"),
  ausstellungsdatum: z.string().optional().nullable(),
  einloesung1: z.string().optional().nullable(),
  einloesung2: z.string().optional().nullable(),
  einloesung3: z.string().optional().nullable(),
  notiz: z.string().optional().nullable(),
});

type VoucherFormValues = z.infer<typeof voucherSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucher?: Voucher;
}

export function VoucherDialog({ open, onOpenChange, voucher }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const form = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      gutscheinnummer: "",
      betrag: 0,
      key: "",
      ausstellungsdatum: "",
      einloesung1: "",
      einloesung2: "",
      einloesung3: "",
      notiz: "",
    },
  });

  useEffect(() => {
    if (voucher && open) {
      form.reset({
        gutscheinnummer: voucher.gutscheinnummer,
        betrag: voucher.betrag,
        key: voucher.key,
        ausstellungsdatum: voucher.ausstellungsdatum ? voucher.ausstellungsdatum.split("T")[0] : "",
        einloesung1: voucher.einloesung1 ? voucher.einloesung1.split("T")[0] : "",
        einloesung2: voucher.einloesung2 ? voucher.einloesung2.split("T")[0] : "",
        einloesung3: voucher.einloesung3 ? voucher.einloesung3.split("T")[0] : "",
        notiz: voucher.notiz ?? "",
      });
    } else if (!voucher && open) {
      form.reset({
        gutscheinnummer: "",
        betrag: 0,
        key: "",
        ausstellungsdatum: format(new Date(), "yyyy-MM-dd"),
        einloesung1: "",
        einloesung2: "",
        einloesung3: "",
        notiz: "",
      });
    }
  }, [voucher, open, form]);

  const createMutation = useCreateVoucher({
    mutation: {
      onSuccess: () => {
        toast({ title: "Gutschein angelegt" });
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVoucherStatsQueryKey() });
        onOpenChange(false);
      },
      onError: (err: any) => {
        toast({ title: "Fehler", description: err.message, variant: "destructive" });
      }
    }
  });

  const updateMutation = useUpdateVoucher({
    mutation: {
      onSuccess: () => {
        toast({ title: "Gutschein aktualisiert" });
        queryClient.invalidateQueries({ queryKey: getListVouchersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetVoucherStatsQueryKey() });
        onOpenChange(false);
      },
      onError: (err: any) => {
        toast({ title: "Fehler", description: err.message, variant: "destructive" });
      }
    }
  });

  const onSubmit = (data: VoucherFormValues) => {
    const payload = {
      ...data,
      ausstellungsdatum: data.ausstellungsdatum ? new Date(data.ausstellungsdatum).toISOString() : null,
      einloesung1: data.einloesung1 ? new Date(data.einloesung1).toISOString() : null,
      einloesung2: data.einloesung2 ? new Date(data.einloesung2).toISOString() : null,
      einloesung3: data.einloesung3 ? new Date(data.einloesung3).toISOString() : null,
      notiz: data.notiz || null,
    };

    if (voucher) {
      updateMutation.mutate({ id: voucher.id, data: payload });
    } else {
      createMutation.mutate({ data: payload });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{voucher ? "Gutschein bearbeiten" : "Neuer Gutschein"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="gutscheinnummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gutscheinnummer</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="betrag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Betrag (€)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ausstellungsdatum"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ausstellungsdatum</FormLabel>
                  <FormControl>
                    <Input type="date" value={field.value || ""} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <FormField
                control={form.control}
                name="einloesung1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einlösung 1</FormLabel>
                    <FormControl>
                      <Input type="date" value={field.value || ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="einloesung2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einlösung 2</FormLabel>
                    <FormControl>
                      <Input type="date" value={field.value || ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="einloesung3"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einlösung 3</FormLabel>
                    <FormControl>
                      <Input type="date" value={field.value || ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notiz"
              render={({ field }) => (
                <FormItem className="pt-2 border-t">
                  <FormLabel>Notiz / Verarbeitungsvermerk</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Freie Notiz zum Gutschein..."
                      className="resize-none h-20"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" className="mr-2" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Speichern..." : "Speichern"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
