export type FirstPieceInspectionRecord = Record<string, unknown>

export type FirstPieceInspectionDraft = {
  approvedBy: string
  readings: Record<string, string[]>
  remark: string
}

type DraftStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">

const openTasksStorageKey = "mrmpl:first-piece-inspection:open-tasks"

function draftStorageKey(reportId: string) {
  return `mrmpl:first-piece-inspection:draft:${reportId}`
}

function asRecord(value: unknown): FirstPieceInspectionRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  return value as FirstPieceInspectionRecord
}

function asString(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (value === null || value === undefined) return ""
  return String(value)
}

export function readFirstPieceInspectionTasks(storage: DraftStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(openTasksStorageKey) || "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (task): task is FirstPieceInspectionRecord =>
        typeof task === "object" && task !== null && !Array.isArray(task)
    )
  } catch {
    return []
  }
}

export function writeFirstPieceInspectionTasks(
  storage: DraftStorage,
  tasks: FirstPieceInspectionRecord[]
) {
  storage.setItem(openTasksStorageKey, JSON.stringify(tasks))
}

export function mergeFirstPieceInspectionTasks(
  keyForTask: (task: FirstPieceInspectionRecord) => string,
  ...taskGroups: FirstPieceInspectionRecord[][]
) {
  const tasksByKey = new Map<string, FirstPieceInspectionRecord>()
  for (const tasks of taskGroups) {
    for (const task of tasks) {
      const key = keyForTask(task)
      if (key) tasksByKey.set(key, task)
    }
  }
  return [...tasksByKey.values()]
}

export function readFirstPieceInspectionDraft(
  storage: DraftStorage,
  reportId: string
): FirstPieceInspectionDraft | undefined {
  if (!reportId) return undefined
  try {
    const storedDraft = storage.getItem(draftStorageKey(reportId))
    if (!storedDraft) return undefined
    const stored = asRecord(JSON.parse(storedDraft))
    const readings = Object.fromEntries(
      Object.entries(asRecord(stored.readings))
        .filter(([, values]) => Array.isArray(values))
        .map(([key, values]) => [key, (values as unknown[]).map(asString)])
    )
    return {
      approvedBy: asString(stored.approvedBy),
      readings,
      remark: asString(stored.remark),
    }
  } catch {
    return undefined
  }
}

export function writeFirstPieceInspectionDraft(
  storage: DraftStorage,
  reportId: string,
  draft: FirstPieceInspectionDraft
) {
  if (!reportId) return
  storage.setItem(draftStorageKey(reportId), JSON.stringify(draft))
}

export function removeFirstPieceInspectionDraft(
  storage: DraftStorage,
  reportId: string
) {
  if (!reportId) return
  storage.removeItem(draftStorageKey(reportId))
}
