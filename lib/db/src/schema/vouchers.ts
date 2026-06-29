import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vouchersTable = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  gutscheinnummer: text("gutscheinnummer").notNull(),
  betrag: numeric("betrag", { precision: 10, scale: 2 }).notNull(),
  key: text("key").notNull(),
  ausstellungsdatum: text("ausstellungsdatum"),
  einloesung1: text("einloesung1"),
  einloesung2: text("einloesung2"),
  einloesung3: text("einloesung3"),
  notiz: text("notiz"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVoucherSchema = createInsertSchema(vouchersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateVoucherSchema = createUpdateSchema(vouchersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVoucher = z.infer<typeof insertVoucherSchema>;
export type UpdateVoucher = z.infer<typeof updateVoucherSchema>;
export type Voucher = typeof vouchersTable.$inferSelect;
