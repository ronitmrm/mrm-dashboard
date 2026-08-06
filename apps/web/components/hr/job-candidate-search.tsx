"use client"

import type { RecruitmentCandidateRow } from "@workspace/db"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Search } from "lucide-react"
import { useMemo, useState } from "react"

import { assignCandidateAction } from "@/app/hr/actions"

type CandidateOption = Pick<
  RecruitmentCandidateRow,
  | "currentCompany"
  | "departments"
  | "email"
  | "id"
  | "name"
  | "phone"
  | "status"
>

export function JobCandidateSearch({
  assignedCandidateIds,
  candidates,
  jobId,
}: {
  assignedCandidateIds: string[]
  candidates: CandidateOption[]
  jobId: string
}) {
  const [query, setQuery] = useState("")
  const assigned = useMemo(
    () => new Set(assignedCandidateIds),
    [assignedCandidateIds]
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matches = candidates
    .filter((candidate) => {
      if (!normalizedQuery) return true
      return [
        candidate.name,
        candidate.phone,
        candidate.email,
        candidate.currentCompany,
        candidate.departments.join(" "),
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
    })
    .slice(0, 25)

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search candidates"
          className="pl-9"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, phone, email, company, or department"
          value={query}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {matches.length} of {candidates.length} candidates. Search to
        narrow the list.
      </p>
      <div className="max-h-96 overflow-y-auto rounded-2xl border">
        {matches.length ? (
          matches.map((candidate) => {
            const isAssigned = assigned.has(candidate.id)
            return (
              <div
                className="flex flex-col gap-3 border-b p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                key={candidate.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{candidate.name}</p>
                    <Badge variant={isAssigned ? "default" : "outline"}>
                      {isAssigned ? "Assigned to this job" : candidate.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {candidate.phone}
                    {candidate.email ? ` · ${candidate.email}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {candidate.departments.join(", ") ||
                      "No preferred department"}
                    {candidate.currentCompany
                      ? ` · ${candidate.currentCompany}`
                      : ""}
                  </p>
                </div>
                <form action={assignCandidateAction}>
                  <input
                    name="candidate_id"
                    type="hidden"
                    value={candidate.id}
                  />
                  <input name="job_id" type="hidden" value={jobId} />
                  <input name="return_job_id" type="hidden" value={jobId} />
                  <Button disabled={isAssigned} size="sm" type="submit">
                    {isAssigned ? "Assigned" : "Assign candidate"}
                  </Button>
                </form>
              </div>
            )
          })
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No candidates match this search.
          </p>
        )}
      </div>
    </div>
  )
}
