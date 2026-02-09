import type { PgDatabase } from "drizzle-orm/pg-core";
import { createRoutes, type PurposePolicy } from "./routes";
import { createSchemas } from "./schemas";
import { createServices } from "./services";
import type { S3Client } from "bun";

export interface FilesBackendOptions<TPurposes extends string> {
  db: PgDatabase<any>;
  s3Client: S3Client;
  policies: Record<TPurposes, PurposePolicy>;
  publicBaseUrl: string;
  presignExpiresIn?: number;
}

export function createFilesBackend<const TPurpose extends string>(
  options: FilesBackendOptions<TPurpose>
) {
  const schemas = createSchemas();
  const services = createServices({
    db: options.db,
    schemas,
    s3Client: options.s3Client,
    publicBaseUrl: options.publicBaseUrl,
    presignExpiresIn: options.presignExpiresIn,
  });
  const routes = createRoutes({
    services,
    policies: options.policies,
  });
  return {
    schemas,
    routes,
    services,
  } as const;
}