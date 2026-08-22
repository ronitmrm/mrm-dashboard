import {
  dataWorkspaceTransferAction,
  type DataWorkspaceTransferAction,
  type DataWorkspaceView,
} from "./data-workspace-transfer"

export type MasterDataTransferAction = DataWorkspaceTransferAction
export type MasterDataView = DataWorkspaceView

export const masterDataTransferAction = dataWorkspaceTransferAction
