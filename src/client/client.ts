import { treaty, type Treaty } from "@elysiajs/eden";
import type { createFilesServer } from "../server";

export function createFilesClient<
  TServer extends ReturnType<typeof createFilesServer<any>>
>(
  domain: string,
  config?: Treaty.Config
): Treaty.Create<TServer["routes"]> {
  return treaty<TServer["routes"]>(domain, config);
}

export type FilesClient = ReturnType<typeof createFilesClient>;