const PAGE_TITLE = {
  home:         "Home",
  "camera-add": "Add Camera",
  "camera-live":"Live Camera",
  people:       "People",
  settings:     "Settings",
};

export default function Topbar({ page }) {
  return (
    <div className="topbar" style={{ borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
      <h1>{PAGE_TITLE[page] ?? page}</h1>
    </div>
  );
}
