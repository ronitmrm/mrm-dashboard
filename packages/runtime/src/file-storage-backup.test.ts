import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { backupFileStorage, restoreFileStorage } from "./file-storage-backup"

const workspaces: string[] = []

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "mrm-file-storage-"))
  workspaces.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

describe("local file-storage backup and restore", () => {
  it("restores every byte from a checksum-verified manifest", async () => {
    const root = await workspace()
    const source = join(root, "source")
    const backup = join(root, "backup")
    const restored = join(root, "restored")
    await mkdir(join(source, "commercial", "orders"), { recursive: true })
    await mkdir(join(source, "commercial", "drawings"), { recursive: true })
    await writeFile(
      join(source, "commercial", "orders", "po.pdf"),
      Buffer.from([0, 1, 2, 3, 255])
    )
    await writeFile(
      join(source, "commercial", "drawings", "drawing.dwg"),
      "drawing-bytes"
    )

    const created = await backupFileStorage({
      backupPath: backup,
      sourcePath: source,
    })
    expect(created).toMatchObject({ fileCount: 2, totalBytes: 18 })

    const result = await restoreFileStorage({
      backupPath: backup,
      destinationPath: restored,
    })
    expect(result).toEqual(created)
    await expect(
      readFile(join(restored, "commercial", "orders", "po.pdf"))
    ).resolves.toEqual(Buffer.from([0, 1, 2, 3, 255]))
    await expect(
      readFile(join(restored, "commercial", "drawings", "drawing.dwg"), "utf8")
    ).resolves.toBe("drawing-bytes")
  })

  it("rejects tampered backups, symlinks, nested backup paths, and nonempty restores", async () => {
    const root = await workspace()
    const source = join(root, "source")
    await mkdir(source)
    await writeFile(join(source, "one.txt"), "one")
    await symlink(join(source, "one.txt"), join(source, "linked.txt"))

    await expect(
      backupFileStorage({
        backupPath: join(root, "backup"),
        sourcePath: source,
      })
    ).rejects.toThrow("symbolic link")

    await rm(join(source, "linked.txt"))
    await expect(
      backupFileStorage({
        backupPath: join(source, "nested"),
        sourcePath: source,
      })
    ).rejects.toThrow("outside the storage root")

    const backup = join(root, "backup")
    await backupFileStorage({ backupPath: backup, sourcePath: source })
    await writeFile(join(backup, "files", "one.txt"), "two")
    await expect(
      restoreFileStorage({
        backupPath: backup,
        destinationPath: join(root, "restored"),
      })
    ).rejects.toThrow("checksum")

    const cleanBackup = join(root, "clean-backup")
    await backupFileStorage({ backupPath: cleanBackup, sourcePath: source })
    const occupied = join(root, "occupied")
    await mkdir(occupied)
    await writeFile(join(occupied, "keep.txt"), "keep")
    await expect(
      restoreFileStorage({ backupPath: cleanBackup, destinationPath: occupied })
    ).rejects.toThrow("must be empty")
  })
})
