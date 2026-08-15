export function nextRecruitmentTemplateCode(templateCodes: Iterable<string>) {
  let highestSequence = 0
  for (const templateCode of templateCodes) {
    const match = /^JRT-(\d+)$/i.exec(templateCode.trim())
    if (!match?.[1]) continue
    highestSequence = Math.max(highestSequence, Number(match[1]))
  }
  return `JRT-${String(highestSequence + 1).padStart(4, "0")}`
}

export function recruitmentAdvisoryLockKey(parts: Iterable<string>) {
  return [...parts].map((part) => part.trim().toLowerCase()).join(":")
}

export function recruitmentMasterCodeFromName(name: string) {
  const words = name
    .normalize("NFKD")
    .toUpperCase()
    .match(/[A-Z0-9]+/g)
    ?.filter((word) => word !== "AND")

  if (!words?.length) return ""
  if (words.length === 1) return words[0]!.slice(0, 2)
  return words.map((word) => word[0]).join("")
}

export function nextRecruitmentMasterCode(
  name: string,
  existingCodes: Iterable<string>
) {
  const baseCode = recruitmentMasterCodeFromName(name)
  const normalizedCodes = new Set(
    [...existingCodes].map((code) => code.trim().toUpperCase())
  )
  if (!normalizedCodes.has(baseCode)) return baseCode

  let highestSuffix = 1
  const suffixPattern = new RegExp(`^${baseCode}-(\\d+)$`)
  for (const code of normalizedCodes) {
    const match = suffixPattern.exec(code)
    if (!match?.[1]) continue
    highestSuffix = Math.max(highestSuffix, Number(match[1]))
  }
  return `${baseCode}-${highestSuffix + 1}`
}

export function nextRecruitmentCombinedRoleIdentity(
  vacancyCodes: Iterable<string>
) {
  let highestSequence = 0
  for (const vacancyCode of vacancyCodes) {
    const match = /^CMB-(\d+)$/i.exec(vacancyCode.trim())
    if (!match?.[1]) continue
    highestSequence = Math.max(highestSequence, Number(match[1]))
  }
  const sequence = highestSequence + 1
  return {
    defaultName: `Combined ${sequence}`,
    vacancyCode: `CMB-${sequence}`,
  }
}

export function nextRecruitmentPostIdentity(input: {
  departmentCode: string
  designationCode: string
  existingPostCodes: Iterable<string>
}) {
  const departmentCode = input.departmentCode.trim().toUpperCase()
  const designationCode = input.designationCode.trim().toUpperCase()
  if (!departmentCode || !designationCode) return null

  const prefix = `${departmentCode}-${designationCode}-`
  let highestSequence = 0
  for (const existingPostCode of input.existingPostCodes) {
    const normalizedPostCode = existingPostCode.trim().toUpperCase()
    if (!normalizedPostCode.startsWith(prefix)) continue
    const sequence = Number(normalizedPostCode.slice(prefix.length))
    if (!Number.isInteger(sequence) || sequence < 1) continue
    highestSequence = Math.max(highestSequence, sequence)
  }

  const vacancyNumber = String(highestSequence + 1)
  const postCode = `${prefix}${vacancyNumber}`
  return {
    postCode,
    vacancyCode: postCode,
    vacancyNumber,
  }
}
