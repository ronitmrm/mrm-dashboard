"use client"

import { useMemo, useState } from "react"

import type { RecruitmentMasterSnapshot } from "@workspace/db"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  ExcelColumnFilter,
  matchesColumnFilter,
  uniqueFilterOptions,
} from "@/components/hr/excel-column-filter"

function MasterTable({
  rows,
  title,
}: {
  rows: RecruitmentMasterSnapshot["departments"]
  title: string
}) {
  const [codeFilter, setCodeFilter] = useState<string[] | null>(null)
  const [nameFilter, setNameFilter] = useState<string[] | null>(null)
  const options = useMemo(
    () => ({
      codes: uniqueFilterOptions(rows.map((row) => row.code)),
      names: uniqueFilterOptions(rows.map((row) => row.name)),
    }),
    [rows]
  )
  const visibleRows = rows.filter(
    (row) =>
      matchesColumnFilter(row.code, codeFilter) &&
      matchesColumnFilter(row.name, nameFilter)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Showing {visibleRows.length} of {rows.length} active records
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
            </TableRow>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>
                <ExcelColumnFilter
                  label={`${title} code`}
                  onApply={setCodeFilter}
                  options={options.codes}
                  selected={codeFilter}
                />
              </TableHead>
              <TableHead>
                <ExcelColumnFilter
                  label={`${title} name`}
                  onApply={setNameFilter}
                  options={options.names}
                  selected={nameFilter}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono">{row.code}</TableCell>
                <TableCell>{row.name}</TableCell>
              </TableRow>
            ))}
            {!visibleRows.length ? (
              <TableRow>
                <TableCell
                  className="py-10 text-center text-muted-foreground"
                  colSpan={2}
                >
                  No records match the selected filters.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function MasterTables({
  masters,
}: {
  masters: RecruitmentMasterSnapshot
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <MasterTable rows={masters.departments} title="Departments" />
      <MasterTable rows={masters.designations} title="Designations" />
    </div>
  )
}
