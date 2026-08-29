import path from "node:path"

import { validateUserAttachment } from "./user-attachment-security"

export const commercialArtifactPurposes = [
  "drawing",
  "sales_clarification",
  "internal_drawing",
  "customer_marked",
  "cad",
] as const

export type CommercialArtifactPurpose =
  (typeof commercialArtifactPurposes)[number]

export type DesignAttachmentKind = Extract<
  CommercialArtifactPurpose,
  "cad" | "customer_marked" | "internal_drawing"
>

export function designBomAttachmentPurpose({
  kind,
  lineNumber,
}: {
  kind: DesignAttachmentKind
  lineNumber: number
}) {
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    throw new Error("Design BOM attachment line number must be positive.")
  }
  return `bom_line_${lineNumber}_${kind}`
}

export function designBomAttachmentFieldName(input: {
  kind: DesignAttachmentKind
  lineNumber: number
}) {
  return `${designBomAttachmentPurpose(input)}_file`
}

export function parseDesignBomAttachmentPurpose(purpose: string) {
  const match =
    /^bom_line_([1-9]\d*)_(cad|customer_marked|internal_drawing)$/.exec(purpose)
  if (!match) return null
  return {
    kind: match[2] as DesignAttachmentKind,
    lineNumber: Number(match[1]),
  }
}

export const commercialAttachmentLimitBytes = 25 * 1024 * 1024
export const commercialAttachmentRequestLimitBytes = 26 * 1024 * 1024

const declaredMediaTypes: Record<string, ReadonlySet<string>> = {
  ".dwg": new Set([
    "application/acad",
    "application/dwg",
    "application/octet-stream",
    "application/x-acad",
    "image/vnd.dwg",
    "image/x-dwg",
  ]),
  ".dxf": new Set([
    "application/dxf",
    "application/octet-stream",
    "application/x-autocad",
    "image/vnd.dxf",
    "image/x-dxf",
    "text/plain",
  ]),
  ".jpeg": new Set(["application/octet-stream", "image/jpeg", "image/jpg"]),
  ".jpg": new Set(["application/octet-stream", "image/jpeg", "image/jpg"]),
  ".pdf": new Set(["application/octet-stream", "application/pdf"]),
  ".png": new Set(["application/octet-stream", "image/png"]),
}

const canonicalMediaTypes: Record<string, string> = {
  ".dwg": "application/dwg",
  ".dxf": "application/dxf",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
}

export function validateCommercialAttachment({
  bytes,
  declaredMediaType,
  fileName,
  purpose,
}: {
  bytes: Buffer
  declaredMediaType: string
  fileName: string
  purpose: CommercialArtifactPurpose
}) {
  if (bytes.byteLength > commercialAttachmentLimitBytes) {
    throw new Error("Drawing files must not exceed 25 MB.")
  }
  const validated = validateUserAttachment({
    bytes,
    fileName,
    purpose: "drawing",
  })
  const extension = path.extname(validated.fileName).toLowerCase()
  const normalizedDeclaredMediaType = declaredMediaType.toLowerCase().trim()
  if (
    normalizedDeclaredMediaType &&
    !declaredMediaTypes[extension]?.has(normalizedDeclaredMediaType)
  ) {
    throw new Error("Drawing file media type does not match its extension.")
  }
  return {
    ...validated,
    mediaType: canonicalMediaTypes[extension] ?? "application/octet-stream",
    purpose,
  }
}
