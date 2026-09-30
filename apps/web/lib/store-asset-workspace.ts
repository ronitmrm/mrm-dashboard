export function storeAssetWorkspaceHref(code: string) {
  return `/store/assets/${encodeURIComponent(code)}`
}

export function storeAssetCalibrationHref(code: string) {
  return `${storeAssetWorkspaceHref(code)}?tab=calibration`
}
