import {
  commercialMasterKinds,
  commercialMasterWorkspaceKind,
} from "../commercial-master-workspace"
import {
  masterCapability,
  scopedMasters,
  type MasterAction,
} from "./master-capabilities"

export function masterRecordCapability(
  record: {
    kind: string
    productionFloorCode: string | null
    termType: string | null
  },
  action: MasterAction
) {
  let master = record.kind
  if (master.startsWith("store_")) master = master.slice(6).toUpperCase()
  else if (master.startsWith("hr_"))
    master = master === "hr_job_template" ? "job_templates" : master.slice(3)
  else if (master.startsWith("commercial_")) {
    const selection = commercialMasterKinds.find(
      (entry) =>
        entry.tableKind === master &&
        (!("termType" in entry) || entry.termType === record.termType)
    )
    if (!selection) throw new Error("Unknown commercial master record.")
    master = commercialMasterWorkspaceKind(selection)
  }
  const universal = scopedMasters.some(
    (entry) => entry.master === master && entry.unit === "universal"
  )
  return masterCapability(
    master,
    action,
    universal ? "universal" : (record.productionFloorCode ?? "")
  )
}
