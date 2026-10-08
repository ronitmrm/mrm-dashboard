import { groupEmployeeTerms, type RecruitmentEmployeeAssignmentRow } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { CardContent, CardDescription, CardHeader, CardTitle, SectionCard } from "@workspace/ui/components/card"
import {
  OperationalTable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@workspace/ui/components/table"
import Link from "next/link"

import { StandardState } from "@/components/ui/golden-patterns"
import { employeeDepartmentLabel } from "@/lib/employee-data-csv"

export function EmployeeDataRegister({ assignments, canManage }: {
  assignments: RecruitmentEmployeeAssignmentRow[]
  canManage: boolean
}) {
  const rows = groupEmployeeTerms(assignments)
    .sort((left, right) => (right.joinedOn ?? "").localeCompare(left.joinedOn ?? ""))
  return (
    <SectionCard>
      <CardHeader>
        <CardTitle>Employee Data</CardTitle>
        <CardDescription>
          Each employment period gets a line after joining. Add details later; a rejoin starts a new term.
          Download CSV to fill details in bulk, keeping Assignment ID and Employee ID unchanged. Blank detail cells clear saved values.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <OperationalTable filterStorageKey="hr-employee-data" containerClassName="max-h-[max(20rem,calc(100svh-var(--header-height)-18rem))] rounded-md border">
          <TableHeader><TableRow>
            <TableHead>Employee ID</TableHead><TableHead>Employee Name</TableHead>
            <TableHead>Department / Combined ID</TableHead><TableHead>Designation</TableHead>
            <TableHead>Joined</TableHead><TableHead>Left</TableHead>
            <TableHead>Personal Data</TableHead><TableHead>Term Data</TableHead>
            {canManage ? <TableHead className="text-right">Action</TableHead> : null}
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((term) => {
              const first = term.assignments[0]!
              const designations = [...new Set(term.assignments.map((assignment) => assignment.designation).filter(Boolean))]
              const personalSaved = term.assignments.some((assignment) => assignment.personalDetailsSaved)
              const termSaved = term.assignments.some((assignment) => assignment.termDetailsSaved)
              return <TableRow key={term.anchorId}>
              <TableCell className="font-mono">{term.employeeCode}</TableCell>
              <TableCell className="font-medium">{first.employeeName}</TableCell>
              <TableCell>{employeeDepartmentLabel(term.assignments)}</TableCell>
              <TableCell>{designations.join(", ") || "—"}</TableCell>
              <TableCell>{term.joinedOn ?? "Date needed"}</TableCell>
              <TableCell>{term.endedOn ?? "Current"}</TableCell>
              <TableCell><StatusBadge value={personalSaved ? "Saved" : "Add details"} tone={personalSaved ? "positive" : "warning"} /></TableCell>
              <TableCell><StatusBadge value={termSaved ? "Saved" : "Add details"} tone={termSaved ? "positive" : "warning"} /></TableCell>
              {canManage ? <TableCell className="text-right">
                <Button asChild size="sm" variant="outline"><Link href={`/hr/employees/${term.anchorId}`}>
                  {personalSaved || termSaved ? "View / Edit" : "Add Data"}
                </Link></Button>
              </TableCell> : null}
            </TableRow>})}
            {!rows.length ? <TableRow><TableCell colSpan={canManage ? 9 : 8}>
              <StandardState title="No Joined Employees" description="Employee data lines appear after a join with an Employee ID is confirmed." />
            </TableCell></TableRow> : null}
          </TableBody>
        </OperationalTable>
      </CardContent>
    </SectionCard>
  )
}
