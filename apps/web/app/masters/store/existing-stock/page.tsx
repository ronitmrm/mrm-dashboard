import { randomUUID } from "node:crypto"
import { createStoreRepository } from "@workspace/db"
import { StatusBadge } from "@workspace/ui/components/badge"
import {
  OperationalTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PageHeader } from "@/components/ui/golden-patterns"
import { StoreExistingStockForm } from "@/components/store/store-existing-stock-form"
import { ExistingStockCsvControls } from "@/components/store/existing-stock-csv-controls"
import { MasterDataViewTabs } from "@/components/master-data-view-tabs"
import { requireCapability } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { formatIstDateTime, istDateValue } from "@/lib/date-time"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import { existingStockCsvLimit } from "@/lib/store/existing-stock-csv-columns"

export const maxDuration = 300

export default async function ExistingStockPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; masterView?: string }>
}) {
  await requireCapability("store.stock.read", "/masters/store/existing-stock")
  await requireStoreAction(
    "store.receipts.receive",
    "/masters/store/existing-stock"
  )
  const query = await searchParams
  const records = query.masterView === "masterTables"
  const context =
    "masterUnit=universal&masterMain=store_masters&masterSub=EXISTING_STOCK"
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const data = await (async () => {
    try {
      const organizationId = await repository.organizationIdForCode("MRMPL")
      const [items, locations, suppliers, entries] = await Promise.all([
        repository.listItemTypes(organizationId),
        repository.listLocations(organizationId),
        repository.listSuppliers(organizationId),
        repository.listExistingStockEntries(organizationId),
      ])
      return {
        items,
        locations: locations.filter(
          (location) => location.locationType === "STORE"
        ),
        suppliers,
        entries,
      }
    } finally {
      await repository.close()
    }
  })()
  const entryKey = randomUUID()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Add Existing Stock Entry"
        actions={!records ? <ExistingStockCsvControls /> : undefined}
      />
      <MasterDataViewTabs
        activeView={records ? "masterTables" : "dataEntry"}
        dataEntryHref={`/masters/store/existing-stock?${context}`}
        masterTablesHref={`/masters/store/existing-stock?masterView=masterTables&${context}`}
      />
      {!records ? (
        <>
          <p className="text-sm text-muted-foreground">
            For bulk entry, download the CSV template. Use existing Asset,
            Supplier and Main Store location codes from Master Data. Give each
            row a unique Entry Reference (for example OPEN-001); keep it
            unchanged on re-upload. Dates: DD-MM-YYYY. Separate multiple serial
            numbers with |. Condition: Usable or Needs repair. Up to{" "}
            {existingStockCsvLimit.toLocaleString("en-IN")} rows and{" "}
            {existingStockCsvLimit.toLocaleString("en-IN")} physical units per
            upload. Unknown purchase details may stay blank. Any invalid row
            stops the entire import.
          </p>
          <StoreExistingStockForm
            key={entryKey}
            entryKey={entryKey}
            saved={(await searchParams).saved === "1"}
            today={istDateValue()}
            items={data.items.map(
              ({
                id,
                typeCode,
                assetName,
                identificationName,
                makeModel,
                unit,
                trackingMode,
              }) => ({
                id,
                typeCode,
                assetName,
                identificationName,
                makeModel,
                unit,
                trackingMode,
              })
            )}
            locations={data.locations.map(({ id, name }) => ({ id, name }))}
            suppliers={data.suppliers.map(({ id, name }) => ({ id, name }))}
          />
        </>
      ) : (
        <OperationalTable
          filterStorageKey="store-existing-stock-entries"
          toolbarStart="Existing Stock Entries · latest 100"
        >
          <TableHeader>
            <TableRow>
              {[
                "Recorded On",
                "Asset Code",
                "Asset Name",
                "Identification",
                "Quantity",
                "Purchase Date",
                "Supplier",
                "Price per Unit",
                "Bill Number",
                "Bill Date",
                "Location",
                "Condition",
                "Recorded By",
                "Notes",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatIstDateTime(entry.recordedAt)}</TableCell>
                <TableCell>{entry.assetCode}</TableCell>
                <TableCell>{entry.assetName}</TableCell>
                <TableCell>{entry.identification || "—"}</TableCell>
                <TableCell>
                  {entry.quantity} {entry.unit}
                </TableCell>
                <TableCell>
                  {entry.purchasedOn
                    ? formatCalendarDate(entry.purchasedOn)
                    : "Not known"}
                </TableCell>
                <TableCell>{entry.supplierName || "Not known"}</TableCell>
                <TableCell>
                  {entry.unitPrice === null
                    ? "Not known"
                    : `₹ ${entry.unitPrice}`}
                </TableCell>
                <TableCell>{entry.billNumber || "—"}</TableCell>
                <TableCell>
                  {entry.billDate ? formatCalendarDate(entry.billDate) : "—"}
                </TableCell>
                <TableCell>{entry.locationName}</TableCell>
                <TableCell>
                  <StatusBadge
                    value={
                      entry.condition === "AVAILABLE"
                        ? "Usable"
                        : "Needs repair"
                    }
                    tone={
                      entry.condition === "AVAILABLE" ? "positive" : "danger"
                    }
                  />
                </TableCell>
                <TableCell>{entry.recordedBy}</TableCell>
                <TableCell>{entry.remark || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </OperationalTable>
      )}
    </div>
  )
}
