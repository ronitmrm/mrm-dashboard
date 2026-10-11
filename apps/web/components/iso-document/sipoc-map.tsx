import type { SipocFields } from "@workspace/db/sipoc-domain"
import { sipocLists, sipocTextFields } from "@workspace/db/sipoc-domain"
import { RecordDetails } from "@/components/ui/golden-patterns"
import {
  SectionCard,
  CardHeader,
  CardTitle,
  CardContent,
} from "@workspace/ui/components/card"
import {
  OperationalTable,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@workspace/ui/components/table"
export function SipocMap({
  fields,
  ownerName,
}: {
  fields: SipocFields
  ownerName: string | null
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <RecordDetails
        items={[
          ...sipocTextFields.slice(0, 6).map(({ key, label }) => ({
            label,
            value: fields[key] || "Needs assessment",
          })),
          { label: "Process owner", value: ownerName || "Unassigned" },
          {
            label: "Next review",
            value: fields.nextReviewOn || "Not scheduled",
          },
        ]}
      />
      <SectionCard>
        <CardHeader>
          <CardTitle>
            Suppliers → Inputs → Process → Outputs → Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OperationalTable excelFilters={false} containerClassName="rounded-xl border">
            <TableHeader>
              <TableRow>
                {sipocLists.map(({ key, label }) => (
                  <TableHead key={key}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                {sipocLists.map(({ key }) => (
                  <TableCell
                    key={key}
                    className="max-w-72 min-w-48 align-top whitespace-pre-wrap"
                  >
                    {fields[key].length ? (
                      <ol className="grid gap-3">
                        {fields[key].map((value, i) => (
                          <li key={`${i}-${value}`}>
                            {key === "steps" ? `${i + 1}. ` : ""}
                            {value}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      "Needs assessment"
                    )}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </OperationalTable>
        </CardContent>
      </SectionCard>
      <RecordDetails
        items={sipocTextFields.slice(6).map(({ key, label }) => ({
          label,
          value: fields[key] || "Needs assessment",
        }))}
      />
    </div>
  )
}
