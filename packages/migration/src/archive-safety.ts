export function normalizeArchivePath(path: string) {
  return path.replaceAll("\\", "/")
}

export function normalizeArchive(
  archive: Record<string, Uint8Array>
): Record<string, Uint8Array> {
  const normalized: Record<string, Uint8Array> = {}

  for (const [rawPath, contents] of Object.entries(archive)) {
    const path = normalizeArchivePath(rawPath)
    const segments = path.split("/")
    const contentSegments = path.endsWith("/")
      ? segments.slice(0, -1)
      : segments
    const unsafe =
      !path ||
      path.includes("\0") ||
      path.startsWith("/") ||
      /^[a-z]:\//i.test(path) ||
      contentSegments.some(
        (segment) => segment === "" || segment === "." || segment === ".."
      )

    if (unsafe) {
      throw new Error(`Migration archive contains an unsafe path: ${rawPath}`)
    }
    if (Object.hasOwn(normalized, path)) {
      throw new Error(
        `Migration archive contains duplicate normalized path: ${path}`
      )
    }
    normalized[path] = contents
  }

  return normalized
}
