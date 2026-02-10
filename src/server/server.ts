import type { PgDatabase } from "drizzle-orm/pg-core";
import { createRoutes, type PurposePolicy } from "./routes";
import { createServices, type Services } from "./services";
import type { S3Options } from "bun";

export interface FilesServerOptions<TPurposes extends string> {
  db: PgDatabase<any, any, any>;
  s3Options: S3Options;
  policies: Record<TPurposes, PurposePolicy>;
  presignExpiresIn?: number;
}

export function createFilesServer<const TPurpose extends string>(
  options: FilesServerOptions<TPurpose>
): {
  readonly routes: ReturnType<typeof createRoutes<TPurpose>>;
  readonly services: Services;
} {
  const services = createServices({
    db: options.db,
    s3Options: options.s3Options,
    presignExpiresIn: options.presignExpiresIn,
  });
  const routes = createRoutes({
    services,
    policies: options.policies,
  });
  return {
    routes,
    services,
  };
}