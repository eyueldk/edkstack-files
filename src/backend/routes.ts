import { Elysia, t } from "elysia";
import type { Services } from "./services";

export type Visibility = "private" | "public";

export interface PurposePolicy {
  maxSize?: number;
  allowedMimeTypes?: string[];
  visibility?: Visibility;
}

export function createRoutes<const TPurpose extends string>(
  options: {
    services: Services;
    policies: Record<TPurpose, PurposePolicy>
  }
) {
  
  const { 
    services, 
    policies,
  } = options;

  return new Elysia({
    prefix: "/api",
  }).post("/files/upload", async ({ status, body }) => {
    const { file, purpose } = body;
    const policy = policies[purpose as TPurpose];
    if (!policy) {
      return status(400, {
        message: "Purpose not supported",
      });
    }
    if (policy.maxSize !== undefined && file.size > policy.maxSize) {
      return status(400, {
        message: "File size exceeds the maximum allowed size",
      });
    }
    if (policy.allowedMimeTypes !== undefined && !policy.allowedMimeTypes.includes(file.type)) {
      return status(400, {
        message: "File type not allowed",
      });
    }
    const uploaded = await services.uploadFile({ 
      file, 
      purpose, 
      visibility: policy.visibility ?? "private" 
    });
    return status(200, {
      id: uploaded.id,
      name: uploaded.name,
      key: uploaded.key,
      size: uploaded.size,
      mimeType: uploaded.mimeType,
      createdAt: uploaded.createdAt,
    });
  }, {
    body: UploadRequest(Object.keys(policies) as TPurpose[]),
    response: {
      200: FileResponse,
      400: ErrorResponse,
      500: ErrorResponse,
    }
  });
}

function UploadRequest<const TPurpose extends string>(
  purposes: TPurpose[]
) {
  return t.Object({
    file: t.File(),
    purpose: t.Union(
      purposes.map((p) => t.Literal(p)) as [
        ReturnType<typeof t.Literal<TPurpose>>,
        ...ReturnType<typeof t.Literal<TPurpose>>[],
      ]
    )
  });
}

const ErrorResponse = t.Object({
  message: t.String(),
});

const FileResponse = t.Object({
  id: t.String(),
  name: t.Nullable(t.String()),
  key: t.String(),
  size: t.Number(),
  mimeType: t.String(),
  createdAt: t.Date(),
});