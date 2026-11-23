/** Brand details and pictures used in the email signature. */
export const brand = {
  company: "Mayank Raw Mint Pvt. Ltd.",
  website: "www.mayankrawmint.com",
  green: "#006A49",
  emailFont: "Verdana, Arial, sans-serif",
  assets: {
    logo: "/brand/logo.png",
    banner: "/brand/signature-banner.gif",
    phone: "/brand/icon-phone.png",
    mail: "/brand/icon-mail.png",
    website: "/brand/icon-website.png",
  },
} as const

export const mailApps = {
  outlook: {
    label: "Outlook Desktop / Outlook Web",
    help: "Copy the signature and paste it into Outlook signature settings.",
  },
  applemac: {
    label: "Apple Mail – Mac",
    help: "Copy the signature and paste it into Mail → Settings → Signatures. Keep remote images on.",
  },
  appleiphone: {
    label: "Apple Mail – iPhone",
    help: "Open this page in Safari, copy the signature, then paste it into iPhone Mail signature settings. If iPhone changes the look, shake to Undo once right after pasting.",
  },
  outlookmobile: {
    label: "Outlook App – iPhone / Android",
    help: "Smaller signature for the Outlook phone app. If the app removes the pictures, use Outlook App – Text Only.",
  },
  outlooktext: {
    label: "Outlook App – Text Only",
    help: "Plain text signature. Use it only if the Outlook phone app breaks the picture version.",
  },
  gmail: {
    label: "Gmail",
    help: "Copy the signature and paste it into Gmail → Settings → See all settings → Signature.",
  },
} as const

export type MailApp = keyof typeof mailApps

export type SignatureDetails = {
  name: string
  designation: string
  phone: string
  email: string
  linkedin: string
  website: string
  company: string
  /** Public address the email pictures load from, e.g. https://erp.mayankrawmint.com:9443 */
  imageHost: string
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character
  )

const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`
const websiteHref = (website: string) =>
  /^https?:\/\//i.test(website) ? website : `https://${website}`

export function signatureText(details: SignatureDetails) {
  return [
    details.name,
    details.designation,
    details.company,
    "",
    `Phone: ${details.phone}`,
    `Email: ${details.email}`,
    `Website: ${details.website}`,
  ].join("\n")
}

/** Email-safe table markup; inline styles only, as mail apps strip the rest. */
export function signatureHtml(details: SignatureDetails, mobile: boolean) {
  const size = mobile
    ? { width: 360, logo: 95, banner: 350, left: 105, gap: 12, name: 17, role: 13, row: 12, icon: 14, pad: 3 }
    : { width: 440, logo: 125, banner: 425, left: 135, gap: 16, name: 20, role: 15, row: 14, icon: 16, pad: 4 }
  const host = details.imageHost.replace(/\/+$/, "")
  const image = (path: string) => escapeHtml(`${host}${path}`)
  const green = brand.green
  const font = `font-family:${brand.emailFont};`
  const nameStyle = `color:${green};font-weight:bold;font-size:${size.name}px;line-height:${size.name + 4}px;`
  const name = details.linkedin
    ? `<a href="${escapeHtml(details.linkedin)}" style="${nameStyle}text-decoration:underline;">${escapeHtml(details.name)}</a>`
    : `<span style="${nameStyle}">${escapeHtml(details.name)}</span>`
  const spacer = (height: number) =>
    `<div style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</div>`
  const row = (icon: string, alt: string, href: string, text: string) =>
    `<tr><td valign="middle" style="padding:${size.pad}px ${size.pad * 2}px ${size.pad}px 0;"><img src="${image(icon)}" width="${size.icon}" height="${size.icon}" alt="${alt}" style="display:block;border:0;width:${size.icon}px;height:${size.icon}px;"></td><td valign="middle" style="${font}font-size:${size.row}px;line-height:${size.row + 6}px;"><a href="${escapeHtml(href)}" style="color:${green};text-decoration:underline;">${escapeHtml(text)}</a></td></tr>`

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${size.width}" style="width:${size.width}px;max-width:${size.width}px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;${font}color:#000000;">
<tr><td width="${size.left}" valign="top" style="width:${size.left}px;padding:0 ${size.gap}px 0 0;"><img src="${image(brand.assets.logo)}" width="${size.logo}" alt="MRM" style="display:block;border:0;outline:none;text-decoration:none;width:${size.logo}px;height:auto;"></td>
<td valign="top" style="padding:0;">${name}${spacer(size.pad)}<div style="font-size:${size.role}px;line-height:${size.role + 5}px;color:#000000;">${escapeHtml(details.designation)}</div>${spacer(mobile ? 10 : 14)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
${row(brand.assets.phone, "Phone", phoneHref(details.phone), details.phone)}
${row(brand.assets.mail, "Email", `mailto:${details.email}`, details.email)}
${row(brand.assets.website, "Website", websiteHref(details.website), details.website)}
</table></td></tr>
<tr><td colspan="2" height="${mobile ? 14 : 18}" style="height:${mobile ? 14 : 18}px;line-height:${mobile ? 14 : 18}px;font-size:1px;">&nbsp;</td></tr>
<tr><td colspan="2"><img src="${image(brand.assets.banner)}" width="${size.banner}" alt="${escapeHtml(details.company)}" style="display:block;border:0;outline:none;text-decoration:none;width:${size.banner}px;height:auto;max-width:100%;"></td></tr></table>`
}

export function buildSignature(details: SignatureDetails, app: MailApp) {
  const text = signatureText(details)
  if (app === "outlooktext") return { html: null, text }
  const mobile = app === "appleiphone" || app === "outlookmobile"
  return { html: signatureHtml(details, mobile), text }
}
