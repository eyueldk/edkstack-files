import type { S3Client, S3File } from "bun";
import { nanoid } from "nanoid";
import { extname } from "path";
import { eq, sql, lt, and } from "drizzle-orm";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type { AllSchemas, FileSelect } from "./schemas";

export type Services = ReturnType<typeof createServices>;

type ById = { id: string };
type ByKey = { key: string };

export function createServices(
  options: {
    db: BunSQLDatabase;
    schemas: AllSchemas;
    s3Client: S3Client;
    publicBaseUrl: string;
    keyPrefix?: string;
    presignExpiresIn?: number;
  }
) {
  const { 
    db, 
    schemas, 
    s3Client, 
    publicBaseUrl, 
    keyPrefix = "files",
    presignExpiresIn = 3600
  } = options;
  
  return {

    s3Client,

    async getFile(params: ById): Promise<FileSelect> {
      const [found] = await db
        .select()
        .from(schemas.files)
        .where(eq(schemas.files.id, params.id))
        .limit(1);
      if (!found) {
        throw new Error("File not found");
      }
      return found;
    },

    async getUrl(params: ById): Promise<string> {
      const [found] = await db
        .select({ 
          key: schemas.files.key,
          visibility: schemas.files.visibility,
        })
        .from(schemas.files)
        .where(eq(schemas.files.id, params.id))
        .limit(1);
      if (!found) {
        throw new Error("File not found");
      }
      if (found.visibility === "public") {
        return `${publicBaseUrl}/${found.key}`;
      }
      return s3Client.presign(found.key, { expiresIn: presignExpiresIn });
    },

    async uploadFile(params: {
      file: File;
      purpose: string;
      visibility: "private" | "public";
    }): Promise<FileSelect> {
      const id = nanoid();
      const ext = extname(params.file.name);
      const key = [keyPrefix, params.visibility, params.purpose, `${id}${ext}`].join("/");
      const s3file = s3Client.file(key);
      await s3file.write(params.file, {
        type: params.file.type,
        acl: params.visibility === "public" ? "public-read" : "private",
      });
      try {
        const [created] = await db.insert(schemas.files)
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
        .delete(schemas.files)
        .where(eq(schemas.files.id, params.id))
        .returning();
      if (!deleted) return;
      await s3Client.delete(deleted.key);
    },

    async acquireFile(params: ById & { 
      purpose?: string 
    }): Promise<FileSelect> {
      const [updated] = await db
        .update(schemas.files)
        .set({ refCount: sql`${schemas.files.refCount} + 1` })
        .where(
          and(
            eq(schemas.files.id, params.id),
            params.purpose ? eq(schemas.files.purpose, params.purpose) : undefined,
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
        .update(schemas.files)
        .set({ refCount: sql`${schemas.files.refCount} - 1` })
        .where(eq(schemas.files.id, params.id))
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