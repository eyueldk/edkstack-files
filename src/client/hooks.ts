import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import type { FilesClient } from "./client";
import { edenMutationOptions, type InferMutationOptions } from "eden2query";
import { useFilesClient } from "./provider";

export function useUpload(
  options: InferMutationOptions<FilesClient["api"]["files"]["upload"]["post"]>
) {
  const filesClient = useFilesClient() ;
  return useMutation({
    ...options,
    ...edenMutationOptions(
      filesClient.api.files.upload.post,
    ),
  });
}