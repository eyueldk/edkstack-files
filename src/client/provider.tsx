import { createContext, useContext, type ReactNode } from "react";
import type { FilesClient } from "./client";


const FilesClientContext = createContext<FilesClient | null>(null);

export function FilesClientProvider(props: {
  filesClient: FilesClient;
  children: ReactNode;
}) {
  return (
    <FilesClientContext.Provider value={props.filesClient}>
      {props.children}
    </FilesClientContext.Provider>
  );
}

export function useFilesClient() {
  const context = useContext(FilesClientContext);
  if (!context) {
    throw new Error("useFilesClient must be used within a FilesClientProvider");
  }
  return context;
}
