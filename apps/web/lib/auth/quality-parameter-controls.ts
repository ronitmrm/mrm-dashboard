export const qualityParameterControls = ["download", "add", "remove"] as const

export type QualityParameterControl = (typeof qualityParameterControls)[number]

export function qualityParameterControlKey(
  floor: string,
  control: QualityParameterControl
) {
  return `masters.${floor}.quality_parameter_master.${control}`
}

export const qualityParameterControlLabels = {
  download: "Download CSV",
  add: "Add Parameter",
  remove: "Remove Parameter",
} satisfies Record<QualityParameterControl, string>
