import { readFile } from "node:fs/promises"

export type RecruitmentSourceRow = Record<string, unknown> & { id: string }

export type RecruitmentArchive = {
  assignments: RecruitmentSourceRow[]
  candidates: RecruitmentSourceRow[]
  combinedRoleGroups: RecruitmentSourceRow[]
  departments: RecruitmentSourceRow[]
  designations: RecruitmentSourceRow[]
  events: RecruitmentSourceRow[]
  interviews: RecruitmentSourceRow[]
  jobs: RecruitmentSourceRow[]
  postMasters: RecruitmentSourceRow[]
  requirementTemplates: RecruitmentSourceRow[]
}

const collectionNames = [
  "assignments",
  "candidates",
  "combinedRoleGroups",
  "departments",
  "designations",
  "events",
  "interviews",
  "jobs",
  "postMasters",
  "requirementTemplates",
] as const

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function parseRecruitmentArchive(value: unknown): RecruitmentArchive {
  const source = record(value)
  if (!source) throw new Error("Recruitment archive must be a JSON object.")

  return Object.fromEntries(
    collectionNames.map((name) => {
      const value = source[name]
      if (!Array.isArray(value)) {
        throw new Error(`Recruitment archive is missing the ${name} array.`)
      }
      const rows = value.map((candidate, index) => {
        const row = record(candidate)
        const id = String(row?.id ?? "").trim()
        if (!row || !id) {
          throw new Error(`${name}[${index}] must be an object with an id.`)
        }
        return { ...row, id }
      })
      return [name, rows]
    })
  ) as RecruitmentArchive
}

export async function readRecruitmentArchive(path: string) {
  return parseRecruitmentArchive(JSON.parse(await readFile(path, "utf8")))
}
