// Retained register filters and sign-in/theme preferences keep their keys.
const retiredPrefixes = [
  "iso:pending-actions:",
  "iso:task-history:",
  "iso:workflow-history:",
  "iso-document:",
  "iso-sipoc-",
  "sipoc-history-",
  "iso-satisfaction-",
  "iso-interested-party-",
  "iso-management-review-",
  "iso-review-",
  "iso-analysis-",
  "iso-risk-",
] as const

export function clearRetiredPageStorage(storage: Storage) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index)
    if (
      key &&
      (retiredPrefixes.some((prefix) => key.startsWith(prefix)) ||
        /^mrmpl:\/iso-document\/(pending-actions|sipoc|customer-satisfaction|interested-parties|management-review|analysis|documents)(?:\/|:)/.test(
          key
        ))
    ) {
      storage.removeItem(key)
    }
  }
}
