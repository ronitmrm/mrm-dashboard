export const documentControlCapabilities = {
  manage: "iso.documents.manage",
  approve: "iso.documents.approve",
  release: "iso.documents.release",
} as const

export type DocumentControlAction = keyof typeof documentControlCapabilities
