import * as XLSX from "xlsx"

export function xlsxResponse(workbook: XLSX.WorkBook, fileName: string) {
  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer
  return new Response(
    output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength
    ) as ArrayBuffer,
    {
      headers: {
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    }
  )
}
