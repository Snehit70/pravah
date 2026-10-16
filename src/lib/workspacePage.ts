import type { AppPage } from "../components/TopNavbar";

export function readWorkspacePage(): AppPage {
  try {
    const page = sessionStorage.getItem("pravah_active_page");
    if (page === "goals" || page === "insights" || page === "settings") return page;
  } catch { /* The timeline remains available when browser storage is blocked. */ }
  return "timeline";
}
