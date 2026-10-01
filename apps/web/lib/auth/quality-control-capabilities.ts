import type { PageAccessDefinition } from "./page-access-types"

export const qualityControlPageAccess = [
  {
    href: "/quality-control",
    id: "quality.control",
    label: "Rejection Entry",
    module: "Quality Control",
    submodule: "Rejection Entry",
    navigation: true,
    readPermissionKey: "quality.control.read",
    writePermissionKey: "quality.control.write",
  },
  {
    href: "/quality-control/calibration",
    id: "quality.control.calibration",
    label: "Calibration",
    module: "Quality Control",
    submodule: "Calibration",
    navigation: true,
    readPermissionKey: "quality.control.calibration.read",
    writePermissionKey: "quality.control.calibration.write",
  },
  {
    href: "/quality-control/store",
    id: "quality.store",
    label: "Quality Store",
    module: "Quality Control",
    submodule: "Quality Store",
    navigation: true,
    readPermissionKey: "quality.store.read",
    writePermissionKey: "quality.store.write",
  },
  {
    href: "/iso-document/rejections",
    id: "quality.rejection_register",
    label: "Rejection Register",
    module: "ISO Document",
    submodule: "Rejection Register",
    navigation: true,
    readPermissionKey: "quality.rejection_register.read",
  },
] satisfies PageAccessDefinition[]
