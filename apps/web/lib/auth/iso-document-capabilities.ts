export const isoDocumentCapabilities = {
  manage: "iso.documents.manage",
  approve: "iso.documents.approve",
  release: "iso.documents.release",
  monitor: "iso.documents.monitor",
} as const

export type IsoDocumentAction = keyof typeof isoDocumentCapabilities
