// Blocking head script: resolve the theme before the stylesheet or React loads.
(() => {
  let preference = "system";
  try {
    const stored = localStorage.getItem("pravah:web-appearance");
    if (["light", "dark", "system"].includes(stored)) preference = stored;
  } catch { /* Storage may be disabled. The system preference still works. */ }
  const dark = preference === "dark" || preference === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
