import { S3Client, type S3Options } from "bun";
import { nanoid } from "nanoid";
import { extname } from "path";
import { eq, sql, and, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { files } from "./schema";

export type Service = ReturnType<typeof createService>;

type ById = { id: string };
type ByIds = { ids: string[] };

export function createService(options: {
  db: PgDatabase<any, any, any>;
  s3: S3Options;
  keyPrefix?: string;
  presignExpiresIn?: number;
}) {
  const { 
    db, 
    s3,
    keyPrefix = "files",
    presignExpiresIn = 3600
  } = options;
  
  const { endpoint } = s3;
  const s3Client = new S3Client(s3);

  return {

    async listFiles(params: ByIds): Promise<typeof files.$inferSelect[]> {
      return await db
        .select()
        .from(files)
        .where(inArray(files.id, params.ids))
        .limit(params.ids.length);
    },

    async getFile(params: ById): Promise<typeof files.$inferSelect | null> {
      const [found] = await db
        .select()
        .from(files)
        .where(eq(files.id, params.id))
        .limit(1);
      return found ?? null;
    },

    buildUrl(file: Pick<typeof files.$inferSelect, "key" | "visibility">): string {
      if (file.visibility === "public") {
        return `${endpoint}/${file.key}`;
      }
      return s3Client.presign(file.key, { 
        expiresIn: presignExpiresIn,
      });
    },

    async getUrl(params: ById): Promise<string | null> {
      const [found] = await db
        .select({ 
          key: files.key,
          visibility: files.visibility,
        })
        .from(files)
        .where(eq(files.id, params.id))
        .limit(1);
      if (!found) return null;
      return this.buildUrl(found);
    },

    async getUrls(params: ByIds): Promise<Record<string, string>> {
      const rows = await db
        .select({
          id: files.id,
          key: files.key,
          visibility: files.visibility,
        })
        .from(files)
        .where(inArray(files.id, params.ids))
        .limit(params.ids.length);
      const urls: Record<string, string> = {};
      for (const row of rows) {
        urls[row.id] = this.buildUrl(row);
      }
      return urls;
    },

    async uploadFile(params: {
      file: File;
      purpose: string;
      visibility: "private" | "public";
    }): Promise<typeof files.$inferSelect> {
      const id = nanoid();
      const ext = extname(params.file.name);
      const key = [keyPrefix, params.purpose, `${id}${ext}`].join("/");
      const s3file = s3Client.file(key);
      await s3file.write(params.file, {
        type: params.file.type,
        acl: params.visibility === "public" ? "public-read" : "private",
        contentDisposition: `attachment; filename="${params.file.name}"`,
      });
      try {
        const [created] = await db.insert(files)
          .values({
            purpose: params.purpose,
            key,
            size: s3file.size,
            name: s3file.name ?? null,
            mimeType: s3file.type,
            visibility: params.visibility,
          })
          .returning();
        if (!created) {
          throw new Error("Failed to create file record");
        }
        return created;
      } catch (error) {
        await s3file.delete().catch(() => {});
        throw error;
      }
    },

    async deleteFile(params: { id: string }): Promise<void> {
      const [deleted] = await db
        .delete(files)
        .where(eq(files.id, params.id))
        .returning();
      if (!deleted) return;
      await s3Client.delete(deleted.key);
    },

    async deleteFiles(params: ByIds): Promise<void> {
      const deleted = await db
        .delete(files)
        .where(inArray(files.id, params.ids))
        .returning({
          key: files.key,
        });

      if (deleted.length === 0) return;

      await Promise.all(
        deleted.map((file) => s3Client.delete(file.key)),
      );
    },

    async acquireFile(params: ById & { 
      purpose?: string 
    }): Promise<typeof files.$inferSelect> {
      const [updated] = await db
        .update(files)
        .set({ refCount: sql`${files.refCount} + 1` })
        .where(
          and(
            eq(files.id, params.id),
            params.purpose ? eq(files.purpose, params.purpose) : undefined,
          )
        )
        .returning();
      if (!updated) {
        throw new Error("File not found");
      }
      return updated;
    },

    async acquireFiles(
      params: ByIds & { purpose?: string },
    ): Promise<typeof files.$inferSelect[]> {
      const updated = await db
        .update(files)
        .set({ refCount: sql`${files.refCount} + 1` })
        .where(
          and(
            inArray(files.id, params.ids),
            params.purpose ? eq(files.purpose, params.purpose) : undefined,
          ),
        )
        .returning();
      return updated;
    },

    async releaseFile(params: ById): Promise<void> {
      const [updated] = await db
        .update(files)
        .set({ refCount: sql`${files.refCount} - 1` })
        .where(eq(files.id, params.id))
        .returning();
      if (!updated) {
        throw new Error("File not found");
      }
      if (updated.refCount < 1) {
        await this.deleteFile({ id: params.id });
      }
    },

    async releaseFiles(params: ByIds): Promise<void> {
      const updated = await db
        .update(files)
        .set({ refCount: sql`${files.refCount} - 1` })
        .where(inArray(files.id, params.ids))
        .returning({
          id: files.id,
          refCount: files.refCount,
        });
      if (updated.length === 0) return;
      const toDelete = updated.filter((file) => file.refCount < 1);
      if (toDelete.length === 0) return;
      await Promise.all(
        toDelete.map((file) => this.deleteFile({ id: file.id })),
      );
    },
  };
}