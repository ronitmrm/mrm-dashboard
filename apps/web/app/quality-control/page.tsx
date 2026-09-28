import { randomUUID } from "node:crypto"
import { ShieldCheck } from "lucide-react"
import { listGrantedCapabilities } from "@/lib/auth/require-capability"
import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import { QualityControlEntry } from "@/components/quality-control-entry"
import { PageHeader } from "@/components/ui/golden-patterns"
import { withRejections } from "@/lib/rejections-server"
import { importQualityRejectionsCsv } from "./actions"

export default async function QualityControlPage() {
  const { options, canWrite } = await withRejections(
    "read",
    async ({ repository, organizationId, userId }) => ({
      options: await repository.entryOptions(organizationId),
      canWrite:
        (await listGrantedCapabilities(userId, ["quality.control.write"]))
          .length > 0,
    })
  )
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        title="Quality Control"
        icon={ShieldCheck}
        description="Record Checking, Assembly and Quality Control rejections across all units."
        actions={
          <>
            <MasterDataCsvDownloadButton href="/quality-control/export.csv" />
            {canWrite ? (
              <MasterDataCsvImportButton
                action={importQualityRejectionsCsv}
                fileField="rejections_csv_file"
                successMessage="Quality Control entries updated from CSV."
              />
            ) : null}
          </>
        }
      />
      <p className="text-sm text-muted-foreground">
        For bulk edits, download the saved entries, change their values, and
        upload the CSV. Keep each entry_id unchanged.
      </p>
      {canWrite ? (
        <QualityControlEntry
          {...options}
          requestId={randomUUID()}
          today={new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(new Date())}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          You have view access. Saving requires Quality Control write access.
        </p>
      )}
    </div>
  )
}
