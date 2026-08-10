import path from "node:path"

type AttachmentPurpose = "drawing" | "purchase-order"

const allowedExtensions: Record<AttachmentPurpose, ReadonlySet<string>> = {
  drawing: new Set([".pdf", ".dwg", ".dxf", ".png", ".jpg", ".jpeg"]),
  "purchase-order": new Set([
    ".pdf",
    ".xlsx",
    ".docx",
    ".png",
    ".jpg",
    ".jpeg",
  ]),
}

const allowedDescription: Record<AttachmentPurpose, string> = {
  drawing: "PDF, DWG, DXF, PNG, or JPEG",
  "purchase-order": "PDF, XLSX, DOCX, PNG, or JPEG",
}

function startsWith(bytes: Buffer, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function hasOoxmlEntry(bytes: Buffer, directory: "word/" | "xl/") {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false
  const archiveText = bytes.toString("latin1")
  return (
    archiveText.includes("[Content_Types].xml") &&
    archiveText.includes(directory)
  )
}

function signatureMatches(extension: string, bytes: Buffer) {
  switch (extension) {
    case ".pdf":
      return bytes.subarray(0, 5).toString("ascii") === "%PDF-"
    case ".dwg":
      return /^AC10\d{2}/.test(bytes.subarray(0, 6).toString("ascii"))
    case ".dxf":
      return bytes
        .subarray(0, 256)
        .toString("utf8")
        .replace(/^\uFEFF/, "")
        .replaceAll("\r\n", "\n")
        .trimStart()
        .startsWith("0\nSECTION")
    case ".png":
      return startsWith(bytes, [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ])
    case ".jpg":
    case ".jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case ".xlsx":
      return hasOoxmlEntry(bytes, "xl/")
    case ".docx":
      return hasOoxmlEntry(bytes, "word/")
    default:
      return false
  }
}

export function validateUserAttachment({
  bytes,
  fileName,
  purpose,
}: {
  bytes: Buffer
  fileName: string
  purpose: AttachmentPurpose
}) {
  const safeName = path.basename(fileName).replace(/[<>:"/\\|?*\r\n]+/g, "_")
  const extension = path.extname(safeName).toLowerCase()
  if (!allowedExtensions[purpose].has(extension)) {
    throw new Error(
      `${purpose === "drawing" ? "Drawing" : "PO source"} files must be a ${allowedDescription[purpose]}.`
    )
  }
  if (!signatureMatches(extension, bytes)) {
    throw new Error(
      `${purpose === "drawing" ? "Drawing" : "PO source"} file content does not match its extension.`
    )
  }
  return { fileName: safeName, mediaType: "application/octet-stream" }
}

export function userAttachmentDownloadHeaders(fileName: string, size: number) {
  const safeName = path.basename(fileName).replace(/[\r\n"]/g, "_")
  return {
    "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "Content-Length": String(size),
    "Content-Type": "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  }
}
