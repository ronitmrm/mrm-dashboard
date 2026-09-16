// MRM Brand Guide B, §15.1. CSS pixels print at 0.75pt at 100% scale.
// One document-wide multiplier is allowed only for single-page Notice/WI PDFs.
export const brandType = {
  display: [40, 800, 1.1, "-0.01em"],
  section: [27, 800, 1.1, "-0.01em"],
  subsection: [16, 600, 1.3, "0"],
  lede: [17, 400, 1.6, "0"],
  body: [15, 400, 1.68, "0"],
  caption: [13, 500, 1.6, "0"],
  eyebrow: [12, 600, 1.3, "0.16em"],
  localHeading: [23, 700, 1.35, "0"],
  localBody: [15, 400, 1.6, "0"],
} as const

export function typeStyle(role: keyof typeof brandType) {
  const [size, weight, leading, tracking] = brandType[role]
  return `font-size:calc(${size}px * var(--print-scale,1));font-weight:${weight};line-height:${leading};letter-spacing:${tracking};`
}

export const brandTypography = `
  :root{--print-scale:1}
  body{font-family:'Outfit',sans-serif;${typeStyle("body")}}
  [lang=hi]{font-family:'Hind','Outfit',sans-serif}
  [lang=gu]{font-family:'Hind Vadodara','Gujarati numerals','Outfit',sans-serif}
  [lang=hi],[lang=gu]{line-height:1.6}
  h1,h2,h3,h4{font-family:inherit;text-transform:none;text-wrap:balance}
  h1{${typeStyle("section")}}h2,h3,h4{${typeStyle("subsection")}}
  [lang=hi] h1,[lang=hi] h2,[lang=hi] h3,[lang=hi] h4,
  [lang=gu] h1,[lang=gu] h2,[lang=gu] h3,[lang=gu] h4{${typeStyle("localHeading")}}
  p,li{font-size:inherit;font-weight:400;letter-spacing:0}
  strong{font-weight:700}em{font-style:normal}u{text-decoration:none}
`
