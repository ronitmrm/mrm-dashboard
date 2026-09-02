import path from "node:path"

type AttachmentPurpose = "drawing" | "purchase-order" | "supplier-quote"

const allowedExtensions: Record<AttachmentPurpose, ReadonlySet<string>> = {
  drawing: new Set([".pdf", ".dwg", ".dxf", ".png", ".jpg", ".jpeg"]),
  "supplier-quote": new Set([".pdf"]),
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
  "supplier-quote": "PDF",
  "purchase-order": "PDF, XLSX, DOCX, PNG, or JPEG",
}

function startsWith(bytes: Buffer, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value)
}

function zipEntryNames(bytes: Buffer) {
  const minimumEocdSize = 22
  const earliestEocd = Math.max(0, bytes.length - 65_557)
  let eocdOffset = -1
  for (
    let offset = bytes.length - minimumEocdSize;
    offset >= earliestEocd;
    offset--
  ) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) return []

  const entryCount = bytes.readUInt16LE(eocdOffset + 10)
  const directorySize = bytes.readUInt32LE(eocdOffset + 12)
  const directoryOffset = bytes.readUInt32LE(eocdOffset + 16)
  if (directoryOffset + directorySize > eocdOffset) return []

  const names: string[] = []
  let offset = directoryOffset
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > eocdOffset || bytes.readUInt32LE(offset) !== 0x02014b50) {
      return []
    }
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength
    if (nextOffset > eocdOffset) return []
    names.push(
      bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
    )
    offset = nextOffset
  }
  return offset === directoryOffset + directorySize ? names : []
}

function hasOoxmlEntry(bytes: Buffer, directory: "word/" | "xl/") {
  const entries = zipEntryNames(bytes)
  return (
    entries.includes("[Content_Types].xml") &&
    entries.some((entry) => entry.startsWith(directory))
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
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
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
      `${purpose === "drawing" ? "Drawing" : purpose === "supplier-quote" ? "Supplier quote" : "PO source"} files must be a ${allowedDescription[purpose]}.`
    )
  }
  if (!signatureMatches(extension, bytes)) {
    throw new Error(
      `${purpose === "drawing" ? "Drawing" : purpose === "supplier-quote" ? "Supplier quote" : "PO source"} file content does not match its extension.`
    )
  }
  return { fileName: safeName, mediaType: "application/octet-stream" }
}

export function userAttachmentDownloadHeaders(fileName: string, size: number) {
  return userAttachmentResponseHeaders(
    fileName,
    size,
    "application/octet-stream",
    false
  )
}

export function userAttachmentResponseHeaders(
  fileName: string,
  size: number,
  declaredMediaType: string | null,
  inline: boolean
) {
  const safeName = path.basename(fileName).replace(/[\r\n"]/g, "_")
  const extension = path.extname(safeName).toLowerCase()
  const previewMediaType =
    extension === ".pdf"
      ? "application/pdf"
      : extension === ".png"
        ? "image/png"
        : extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : null
  const disposition = inline && previewMediaType ? "inline" : "attachment"
  return {
    "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    "Content-Length": String(size),
    "Content-Type": (inline ? previewMediaType : null) ??
      (declaredMediaType === "application/octet-stream"
        ? declaredMediaType
        : "application/octet-stream"),
    "X-Content-Type-Options": "nosniff",
  }
}
