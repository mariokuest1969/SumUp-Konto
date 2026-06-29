import { pgTable, serial, jsonb, timestamp } from "drizzle-orm/pg-core";

export const sumupTransactionsTable = pgTable("sumup_transactions", {
  id: serial("id").primaryKey(),
  data: jsonb("data").notNull().$type<Record<string, string>>(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
});

export type SumupTransaction = typeof sumupTransactionsTable.$inferSelect;
