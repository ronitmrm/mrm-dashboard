import { zipSync } from "fflate"

export function buildQuoteDrawingsZip(
  drawings: readonly {
    lineNumber: number
    fileName: string
    bytes: Uint8Array
  }[]
) {
  return zipSync(
    Object.fromEntries(
      drawings.map((drawing, index) => {
        const name =
          drawing.fileName
            .split(/[\\/]/)
            .at(-1)
            // eslint-disable-next-line no-control-regex -- ZIP names must not contain control characters.
            ?.replace(/[\x00-\x1f<>:"|?*]/g, "_") || "drawing"
        return [
          `Line-${drawing.lineNumber}/${index + 1}-${name}`,
          drawing.bytes,
        ]
      })
    ),
    { level: 0 }
  )
}
