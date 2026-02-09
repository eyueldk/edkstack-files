import { treaty, type Treaty } from "@elysiajs/eden";
import type { createFilesBackend } from "../backend";

export function createFilesClient<
  TBackend extends ReturnType<typeof createFilesBackend<any>>
>(
  domain: string,
  config?: Treaty.Config
) {
  return treaty<TBackend["routes"]>(domain, config);
}

export type FilesClient = ReturnType<typeof createFilesClient>;