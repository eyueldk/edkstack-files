import type { PgDatabase } from "drizzle-orm/pg-core";
import { createRouter, type PurposePolicy } from "./router";
import { createService, type Service } from "./service";
import type { S3Options } from "bun";

export interface FilesServerOptions<TPurposes extends string> {
  db: PgDatabase<any, any, any>;
  s3: S3Options;
  policies: Record<TPurposes, PurposePolicy>;
  presignExpiresIn?: number;
}

export function createFilesServer<const TPurpose extends string>(
  options: FilesServerOptions<TPurpose>
): {
  readonly router: ReturnType<typeof createRouter<TPurpose>>;
  readonly service: Service;
} {
  const service = createService({
    db: options.db,
    s3: options.s3,
    presignExpiresIn: options.presignExpiresIn,
  });
  const router = createRouter({
    service,
    policies: options.policies,
  });
  return {
    router,
    service,
  };
}