export const themeStorageKey = "theme"
export const themeMediaQuery = "(prefers-color-scheme: dark)"

// Runs in the document head, before page content can paint or React hydrates.
export const themeInitializationScript = `(() => {
  let theme;
  try { theme = window.localStorage.getItem(${JSON.stringify(themeStorageKey)}); } catch {}
  const resolved = theme === "light" || theme === "dark"
    ? theme
    : window.matchMedia(${JSON.stringify(themeMediaQuery)}).matches ? "dark" : "light";
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
})();`
