import type { PageAccessDefinition } from "./page-access-types"

export const isoCalibrationPlanPageAccess = {
  href: "/iso-document/calibration-plan",
  id: "iso.calibration_plan",
  label: "Calibration Plan",
  module: "ISO Document",
  submodule: "Calibration Plan",
  navigation: true,
  readPermissionKey: "iso.calibration_plan.read",
} satisfies PageAccessDefinition
