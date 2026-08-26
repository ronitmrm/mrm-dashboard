# Legacy local-file backup and restore

This runbook applies only to historical rows whose bytes still live below
`LOCAL_FILE_STORAGE_PATH`. The application can read those paths but has no
local create, replace, or delete interface. Every new retained file uses the
shared Artifact service and UploadThing.

PostgreSQL remains canonical for historical metadata, ownership, entity links,
sizes, MIME types, and SHA-256 values. Keep a matching filesystem backup until
the legacy rows receive separately approved migration or retirement.

## Backup

The compatibility root is read-only, so a running web process cannot race the
copy with a local write. Resolve both paths explicitly; the backup must be
outside the storage root and must not already exist.

```bash
pnpm files:backup -- /absolute/path/to/local-file-storage /absolute/path/to/new-backup
```

The command rejects symbolic links and unsupported entries, copies every
regular file below `files/`, verifies the source and copied SHA-256 values, and
writes `manifest.json` with each relative path, byte size, checksum, total byte
count, and creation time. Keep the backup and manifest together on encrypted,
access-controlled storage.

## Restore

Stop the web process and restore only into a missing or empty storage root.

```bash
pnpm files:restore -- /absolute/path/to/backup /absolute/path/to/empty-storage-root
```

Before writing, the command rejects unsafe manifest paths, unexpected or
missing backup files, symlinks, size drift, and checksum drift. It then copies
each file and verifies the restored checksum. Only point
`LOCAL_FILE_STORAGE_PATH` at the restored root after the command succeeds.

After a production restore, reconcile PostgreSQL file rows against the restored
paths and stored checksums, then test an authorized legacy download from every
file family. Do not reopen local writes; no such runtime interface remains.

## LM-09 acceptance proof — 2026-07-22

The automated contract restored nested binary and text fixtures byte-for-byte
and rejected a symlink, a nested backup destination, a same-size checksum
tamper, and a nonempty restore destination. The root commands then backed up
and restored two nested files totaling 8,512 bytes; both manifests reported the
same paths, sizes, SHA-256 values, file count, and total byte count.
