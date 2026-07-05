// Maps between the in-app "page" identifiers and real browser URLs.
// The router is the source of truth; these helpers let the existing
// page-string based components keep working unchanged.

export function pageToPath(page) {
  if (page === "home") return "/";
  if (page === "camera-add") return "/cameras/add";
  if (page === "camera-live") return "/cameras/live";
  if (page === "management-attendance") return "/management/attendance";
  if (page === "management-security")   return "/management/security";
  if (page === "management-safety")     return "/management/safety";
  if (page.startsWith("feat/")) {
    const [, group, key] = page.split("/");
    return `/features/${group}/${key}`;
  }
  return `/${page}`;
}

export function pathToPage(pathname) {
  if (pathname === "/") return "home";
  if (pathname === "/cameras/add") return "camera-add";
  if (pathname === "/cameras/live") return "camera-live";
  if (pathname === "/people") return "people";
  if (pathname === "/features/add") return "features-add";
  if (pathname === "/features/manage") return "features-manage";
  if (pathname.startsWith("/features/")) {
    const [, , group, key] = pathname.split("/");
    return `feat/${group}/${key}`;
  }
  if (pathname === "/management/attendance") return "management-attendance";
  if (pathname === "/management/security")   return "management-security";
  if (pathname === "/management/safety")     return "management-safety";
  if (pathname === "/events")   return "events";
  if (pathname === "/settings") return "settings";
  return "";
}
