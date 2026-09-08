import { masterPermissionKey, type MasterAction } from "../../lib/auth/master-capabilities"

export function hrMasterControls(master: string | null, granted: readonly string[]) {
  const has = (action: MasterAction) => master !== null && granted.includes(masterPermissionKey("universal", master, action))
  return {
    create: has("save") || has("create"),
    update: has("save") || has("update") || has("rename"),
    delete: has("delete"),
    import: has("import") || (master !== "employee_assignments" && (has("save") || has("create"))),
    assign: master === "employee_assignments" && has("save"),
  }
}
