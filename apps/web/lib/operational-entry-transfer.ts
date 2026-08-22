import {
  dataWorkspaceTransferAction,
  type DataWorkspaceTransferAction,
  type DataWorkspaceView,
} from "./data-workspace-transfer"

export type OperationalEntryTransferAction = DataWorkspaceTransferAction
export type OperationalEntryTransferView = DataWorkspaceView

export const operationalEntryTransferAction = dataWorkspaceTransferAction
