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
