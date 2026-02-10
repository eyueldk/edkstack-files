import { S3Client, type S3Options } from "bun";
import { nanoid } from "nanoid";
import { extname } from "path";
import { eq, sql, lt, and } from "drizzle-orm";
import type { FileRecord } from "./schemas";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { files } from "./schemas";

export type Services = ReturnType<typeof createServices>;

type ById = { id: string };

export function createServices(
  options: {
    db: PgDatabase<any, any, any>;
    s3Options: S3Options;
    keyPrefix?: string;
    presignExpiresIn?: number;
  }
) {
  const { 
    db, 
    s3Options,
    keyPrefix = "files",
    presignExpiresIn = 3600
  } = options;
  
  const { endpoint } = s3Options;
  const s3Client = new S3Client(s3Options);

  return {

    async getFile(params: ById): Promise<FileRecord> {
      const [found] = await db
        .select()
        .from(files)
        .where(eq(files.id, params.id))
        .limit(1);
      if (!found) {
        throw new Error("File not found");
      }
      return found;
    },

    async getUrl(params: ById): Promise<string> {
      const [found] = await db
        .select({ 
          key: files.key,
          visibility: files.visibility,
        })
        .from(files)
        .where(eq(files.id, params.id))
        .limit(1);
      if (!found) {
        throw new Error("File not found");
      }
      if (found.visibility === "public") {
        return `${endpoint}/${found.key}`;
      }
      return s3Client.presign(found.key, { expiresIn: presignExpiresIn });
    },

    async uploadFile(params: {
      file: File;
      purpose: string;
      visibility: "private" | "public";
    }): Promise<FileRecord> {
      const id = nanoid();
      const ext = extname(params.file.name);
      const key = [keyPrefix, params.visibility, params.purpose, `${id}${ext}`].join("/");
      const s3file = s3Client.file(key);
      await s3file.write(params.file, {
        type: params.file.type,
        acl: params.visibility === "public" ? "public-read" : "private",
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
        await s3file.delete().catch();
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

    async acquireFile(params: ById & { 
      purpose?: string 
    }): Promise<FileRecord> {
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
  };
}