import Link from "next/link"
import type { BrandingRegisterRow } from "@workspace/db"
import {
  brandingLanguageLabels,
  revisionLabel,
  type BrandingLanguage,
  type BrandingType,
} from "@workspace/db/branding-domain"
import { StatusBadge } from "@workspace/ui/components/badge"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
export function BrandingDocumentTable({
  rows,
  type,
}: {
  rows: BrandingRegisterRow[]
  type: BrandingType
}) {
  return (
    <OperationalTable
      filterStorageKey={`branding:${type}:register`}
      containerClassName="max-h-[65vh] rounded-lg border"
      toolbarStart={
        <span className="text-sm font-medium">Document register</span>
      }
    >
      <TableHeader>
        <TableRow>
          {[
            "Number",
            "Name",
            "Department",
            "Languages",
            "Revision",
            "Status",
            "Effective date",
            "Author",
            "Updated",
          ].map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.number ?? "Assigned on issue"}</TableCell>
              <TableCell>
                <Link
                  className="font-medium text-primary hover:underline"
                  href={`/branding/${type}/${row.id}`}
                >
                  {row.title}
                </Link>
              </TableCell>
              <TableCell>{row.department}</TableCell>
              <TableCell>
                {row.languages
                  .map(
                    (language) =>
                      brandingLanguageLabels[language as BrandingLanguage]
                  )
                  .join(", ")}
              </TableCell>
              <TableCell>{revisionLabel(row.revision)}</TableCell>
              <TableCell>
                <StatusBadge
                  tone={row.state === "issued" ? "positive" : "neutral"}
                  value={row.state === "issued" ? "Issued" : "Draft"}
                />
                {row.state === "issued" && row.hasDraft ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Revision draft
                  </span>
                ) : null}
              </TableCell>
              <TableCell>{row.effectiveDate || "—"}</TableCell>
              <TableCell>{row.authorName}</TableCell>
              <TableCell>
                {new Date(row.updatedAt).toLocaleDateString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={9}>
              <StandardState
                variant="empty"
                title="No documents yet"
                description="Use Data Entry to create the first document."
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </OperationalTable>
  )
}
