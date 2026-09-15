import { brandingPictureMaxLength } from "@workspace/db/branding-domain"

// Store a bounded, metadata-free snapshot with the document, not a public URL.
export async function prepareBrandingPicture(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG or WebP picture up to 20 MB.")
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("This browser could not prepare the picture.")
    context.fillStyle = "#F7F7F2"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.88, 0.75, 0.6, 0.45, 0.3]) {
      const picture = canvas.toDataURL("image/jpeg", quality)
      if (picture.length <= brandingPictureMaxLength) return picture
    }
    throw new Error("This picture is too detailed. Choose a smaller picture.")
  } finally {
    bitmap.close()
  }
}
