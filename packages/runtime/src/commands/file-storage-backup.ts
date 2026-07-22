import { backupFileStorage, restoreFileStorage } from "../file-storage-backup"

const [command, firstPath, secondPath] = process.argv
  .slice(2)
  .filter((argument) => argument !== "--")

if (
  !firstPath ||
  !secondPath ||
  (command !== "backup" && command !== "restore")
) {
  throw new Error(
    "Usage: file-storage-backup <backup|restore> <source> <destination>"
  )
}

const result =
  command === "backup"
    ? await backupFileStorage({ backupPath: secondPath, sourcePath: firstPath })
    : await restoreFileStorage({
        backupPath: firstPath,
        destinationPath: secondPath,
      })

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
