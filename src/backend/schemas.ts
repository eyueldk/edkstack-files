import { nanoid } from "nanoid";
import { index, integer, pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";


export type AllSchemas = ReturnType<typeof createSchemas>;
export type FileSchema = AllSchemas["files"];
export type FileSelect = FileSchema["$inferSelect"];
export type FileInsert = FileSchema["$inferInsert"];

export function createSchemas() {

  const files = pgTable("files", {
    id: text("id").primaryKey().$defaultFn(() => `file_${nanoid()}`),
    purpose: text("purpose").notNull(),
    name: text("name"),
    key: text("key").notNull().unique(),
    size: integer("size").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    refCount: integer("ref_count").notNull().default(0),
    visibility: pgEnum("visibility", ["private", "public"])().notNull().default("private"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }, (table) => [
    index("files_key_idx").on(table.key),
    index("files_created_at_idx").on(table.createdAt),
  ]);

  return {
    files,
  }
}