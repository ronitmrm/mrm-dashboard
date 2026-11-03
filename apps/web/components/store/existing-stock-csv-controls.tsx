import {
  MasterDataCsvDownloadButton,
  MasterDataCsvImportButton,
} from "@/components/master-data-csv-import-button"
import { importExistingStoreStockCsvAction } from "@/app/store/actions"
import { existingStockCsvColumns } from "@/lib/store/existing-stock-csv-columns"

export function ExistingStockCsvControls() {
  return (
    <>
      <MasterDataCsvDownloadButton
        columns={existingStockCsvColumns}
        fileName="existing-stock-template.csv"
      />
      <MasterDataCsvImportButton
        action={importExistingStoreStockCsvAction}
        successMessage="Existing stock CSV uploaded successfully. Re-uploading the same Entry References does not add stock again."
      />
    </>
  )
}
