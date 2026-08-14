import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises"
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path"

const MANIFEST_NAME = "manifest.json"
const MANIFEST_VERSION = 1

type BackupOptions = {
  backupPath: string
  sourcePath: string
}

type RestoreOptions = {
  backupPath: string
  destinationPath: string
}

type ManifestFile = {
  bytes: number
  path: string
  sha256: string
}

export type FileStorageBackupManifest = {
  createdAt: string
  fileCount: number
  files: ManifestFile[]
  totalBytes: number
  version: 1
}

function containsPath(parent: string, candidate: string) {
  const child = relative(parent, candidate)
  return (
    child === "" ||
    (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child))
  )
}

async function canonicalFuturePath(path: string) {
  let ancestor = resolve(path)
  const missingSegments: string[] = []
  while (true) {
    try {
      return join(await realpath(ancestor), ...missingSegments.reverse())
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      missingSegments.push(basename(ancestor))
      ancestor = parent
    }
  }
}

function assertSafeRelativePath(path: string) {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path === ".." ||
    path.startsWith(`..${sep}`)
  ) {
    throw new Error(`Unsafe backup manifest path: ${path}`)
  }
}

async function sha256(path: string) {
  const digest = createHash("sha256")
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest("hex")
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error(
        `File storage contains a symbolic link: ${relative(root, path)}`
      )
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)))
      continue
    }
    if (!entry.isFile()) {
      throw new Error(
        `File storage contains an unsupported entry: ${relative(root, path)}`
      )
    }
    files.push(relative(root, path))
  }
  return files
}

function parseManifest(value: unknown): FileStorageBackupManifest {
  if (!value || typeof value !== "object")
    throw new Error("Invalid backup manifest")
  const manifest = value as Partial<FileStorageBackupManifest>
  if (
    manifest.version !== MANIFEST_VERSION ||
    typeof manifest.createdAt !== "string" ||
    !Array.isArray(manifest.files) ||
    typeof manifest.fileCount !== "number" ||
    typeof manifest.totalBytes !== "number"
  ) {
    throw new Error("Invalid backup manifest")
  }

  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.bytes !== "number" ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("Invalid backup manifest file")
    }
    assertSafeRelativePath(file.path)
  }

  const uniquePaths = new Set(manifest.files.map((file) => file.path))
  const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0)
  if (
    uniquePaths.size !== manifest.files.length ||
    manifest.fileCount !== manifest.files.length ||
    manifest.totalBytes !== totalBytes
  ) {
    throw new Error("Invalid backup manifest totals")
  }
  return manifest as FileStorageBackupManifest
}

export async function backupFileStorage(
  options: BackupOptions
): Promise<FileStorageBackupManifest> {
  const sourcePath = await realpath(options.sourcePath)
  const sourceStats = await stat(sourcePath)
  if (!sourceStats.isDirectory())
    throw new Error("File storage root must be a directory")

  const backupPath = await canonicalFuturePath(options.backupPath)
  if (containsPath(sourcePath, backupPath)) {
    throw new Error("Backup path must be outside the storage root")
  }

  const relativePaths = await listFiles(sourcePath)
  await mkdir(backupPath)
  const filesPath = join(backupPath, "files")
  await mkdir(filesPath)
  const files: ManifestFile[] = []

  for (const relativePath of relativePaths) {
    const sourceFile = join(sourcePath, relativePath)
    const backupFile = join(filesPath, relativePath)
    await mkdir(dirname(backupFile), { recursive: true })
    await copyFile(sourceFile, backupFile)
    const [sourceDigest, backupDigest, fileStats] = await Promise.all([
      sha256(sourceFile),
      sha256(backupFile),
      stat(backupFile),
    ])
    if (sourceDigest !== backupDigest) {
      throw new Error(`Backup checksum mismatch: ${relativePath}`)
    }
    files.push({
      bytes: fileStats.size,
      path: relativePath,
      sha256: backupDigest,
    })
  }

  const manifest: FileStorageBackupManifest = {
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    version: MANIFEST_VERSION,
  }
  await writeFile(
    join(backupPath, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      flag: "wx",
    }
  )
  return manifest
}

async function verifyBackup(
  backupPath: string,
  manifest: FileStorageBackupManifest
) {
  const filesPath = join(backupPath, "files")
  const actualPaths = await listFiles(filesPath)
  const expectedPaths = manifest.files.map((file) => file.path)
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    throw new Error("Backup files do not match the manifest")
  }

  for (const file of manifest.files) {
    const backupFile = join(filesPath, file.path)
    const fileStats = await lstat(backupFile)
    if (!fileStats.isFile() || fileStats.size !== file.bytes) {
      throw new Error(`Backup size mismatch: ${file.path}`)
    }
    if ((await sha256(backupFile)) !== file.sha256) {
      throw new Error(`Backup checksum mismatch: ${file.path}`)
    }
  }
}

export async function restoreFileStorage(
  options: RestoreOptions
): Promise<FileStorageBackupManifest> {
  const backupPath = await realpath(options.backupPath)
  const destinationPath = await canonicalFuturePath(options.destinationPath)
  if (containsPath(backupPath, destinationPath)) {
    throw new Error("Restore destination must be outside the backup")
  }

  const manifest = parseManifest(
    JSON.parse(
      await readFile(join(backupPath, MANIFEST_NAME), "utf8")
    ) as unknown
  )
  await verifyBackup(backupPath, manifest)

  try {
    const entries = await readdir(destinationPath)
    if (entries.length > 0) throw new Error("Restore destination must be empty")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    await mkdir(destinationPath, { recursive: true })
  }

  for (const file of manifest.files) {
    const destinationFile = join(destinationPath, file.path)
    await mkdir(dirname(destinationFile), { recursive: true })
    await copyFile(join(backupPath, "files", file.path), destinationFile)
    if ((await sha256(destinationFile)) !== file.sha256) {
      throw new Error(`Restored checksum mismatch: ${file.path}`)
    }
  }
  return manifest
}
