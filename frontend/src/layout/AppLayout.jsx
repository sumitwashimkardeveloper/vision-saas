import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

export default function AppLayout({ page, setPage, user, onLogout, children }) {
  return (
    <div className="app-layout">
      <Sidebar page={page} setPage={setPage} user={user} onLogout={onLogout} />
      <div className="app-body">
        <Topbar page={page} />
        <main>{children}</main>
      </div>
    </div>
  );
}
