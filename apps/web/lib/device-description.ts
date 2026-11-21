// Turns what a browser reveals about itself into something an approver can
// match to a physical device. Browsers never send the manufacturer, so it is
// inferred: Apple from the OS, Android brands from model-number conventions.

export type DeviceDescription = {
  browser: string
  manufacturer: string
  model: string
  os: string
}

const androidBrands: readonly [RegExp, string][] = [
  [/^(SM-|GT-|Galaxy)/i, "Samsung"],
  [/^Pixel/i, "Google"],
  [/^(Redmi|POCO|Mi |MI |M\d{4}[A-Z]|2\d{3}[0-9A-Z]{5,})/, "Xiaomi"],
  [/^RMX\d/, "Realme"],
  [/^CPH\d/, "Oppo"],
  [/^I\d{4}/, "iQOO"],
  [/^V\d{4}/, "Vivo"],
  [/^(ONEPLUS|[A-Z]{2}\d{4}$)/i, "OnePlus"],
  [/^(moto|XT\d{4})/i, "Motorola"],
  [/^(Lenovo|TB-)/i, "Lenovo"],
  [/^(Nokia|TA-\d{4})/i, "Nokia"],
  [/^KF[A-Z]{2,4}/, "Amazon"],
  [/^Infinix/i, "Infinix"],
  [/^TECNO/i, "Tecno"],
  [/^LAVA/i, "Lava"],
  [/^HONOR/i, "Honor"],
]

function browserOf(userAgent: string) {
  const match =
    [
      [/Edg(?:A|iOS)?\/(\d+)/, "Edge"],
      [/OPR\/(\d+)/, "Opera"],
      [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
      [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
      [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
      [/Version\/(\d+)[.\d]* (?:Mobile\/\S+ )?Safari/, "Safari"],
    ] as const
  for (const [pattern, name] of match) {
    const version = userAgent.match(pattern)?.[1]
    if (version) return `${name} ${version}`
  }
  return "Unknown browser"
}

function windowsName(platformVersion: string | null) {
  if (!platformVersion) return "Windows"
  return Number.parseInt(platformVersion, 10) >= 13 ? "Windows 11" : "Windows 10"
}

export function describeDevice(device: {
  model: string | null
  platform: string | null
  platformVersion: string | null
  userAgent: string | null
}): DeviceDescription {
  const userAgent = device.userAgent ?? ""
  const browser = browserOf(userAgent)

  const apple = userAgent.match(/\((iPhone|iPad|iPod)[^)]*OS (\d+)/)
  if (apple) {
    return { browser, manufacturer: "Apple", model: apple[1]!, os: `iOS ${apple[2]}` }
  }
  if (/Macintosh/.test(userAgent)) {
    return { browser, manufacturer: "Apple", model: "Mac or iPad", os: "macOS" }
  }

  const android = userAgent.match(/Android (\d+)(?:[.\d]*)?(?:; ([^;)]+))?/)
  if (android || device.platform === "Android") {
    // Chrome reduces the UA model to "K"; the client hint carries the real one.
    const uaModel = android?.[2]?.replace(/ Build\/.*$/, "").trim()
    const model =
      device.model ?? (uaModel && uaModel !== "K" && uaModel !== "wv" ? uaModel : null)
    const manufacturer =
      (model && androidBrands.find(([pattern]) => pattern.test(model))?.[1]) ??
      "Android device"
    return {
      browser,
      manufacturer,
      model: model ?? "Model hidden",
      os: android ? `Android ${android[1]}` : "Android",
    }
  }

  const os = /Windows/.test(userAgent)
    ? windowsName(device.platformVersion)
    : /CrOS/.test(userAgent)
      ? "ChromeOS"
      : /Linux/.test(userAgent)
        ? "Linux"
        : (device.platform ?? "Unknown OS")
  return { browser, manufacturer: "PC", model: "Not reported", os }
}
