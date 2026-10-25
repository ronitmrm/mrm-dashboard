import { CircleHelp } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { importStoreStorageLocationsAction } from "@/app/department-store/actions"
import { DataDownloadButton } from "@/components/data-download-button"
import { MasterDataCsvImportButton } from "@/components/master-data-csv-import-button"

export function StoreLocationCsvControls({
  canEdit,
  storeCode,
}: {
  canEdit: boolean
  storeCode: string
}) {
  return (
    <>
      <DataDownloadButton
        href={`/api/store/storage-locations?store=${encodeURIComponent(storeCode)}`}
        label="Download Location CSV"
      />
      {canEdit ? (
        <>
          <MasterDataCsvImportButton
            action={importStoreStorageLocationsAction}
            fields={{ store_code: storeCode }}
            label="Upload Locations CSV"
            successMessage="Location assignments saved."
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" type="button" variant="ghost">
                <CircleHelp data-icon="inline-start" />
                Location CSV help
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
              <PopoverHeader>
                <PopoverTitle>Assign existing stock locations</PopoverTitle>
              </PopoverHeader>
              <ol className="flex list-decimal flex-col gap-2 pl-4">
                <li>Download the CSV of stock that can be assigned in this Store.</li>
                <li>
                  Enter an existing rack/bin code from this Store in{" "}
                  <strong>location_code</strong>. For Consumables, separate
                  multiple codes with commas in the same cell: <strong>CNC-A, CNC-B</strong>.
                  Use one code per Non Consumable Unit ID.
                </li>
                <li>
                  Keep <strong>unit_id</strong> for Non Consumables or{" "}
                  <strong>asset_code</strong> for Consumables. Add an optional{" "}
                  <strong>note</strong>, save as CSV, then upload.
                </li>
              </ol>
              <p>
                Each Consumable row replaces its saved location list and keeps
                one combined quantity. Blank locations keep their current
                assignments. Move gauge sets using the set movement form.
              </p>
              <p className="text-muted-foreground">
                Upload up to 500 assignments at a time. If any row has an error,
                no assignments are saved.
              </p>
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </>
  )
}
