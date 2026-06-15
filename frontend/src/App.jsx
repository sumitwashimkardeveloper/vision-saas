import { useEffect, useState } from "react";
import { setToken, setUnauthorizedHandler } from "./api/client.js";
import Login from "./features/auth/Login.jsx";
import Register from "./features/auth/Register.jsx";
import AppLayout from "./layout/AppLayout.jsx";
import AddCamera from "./features/cameras/AddCamera.jsx";
import ViewCamera from "./features/cameras/ViewCamera.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import FeaturesPage from "./features/ppe/FeaturesPage.jsx";
import { getCameras } from "./api/cameras.js";

function loadSession() {
  const token    = localStorage.getItem("vfr_token") || "";
  const identity = JSON.parse(localStorage.getItem("vfr_id") || "null");
  return token && identity ? { token, identity } : null;
}


function HomePage() {
  const [stats, setStats] = useState({ cameras: 0 });

  useEffect(() => {
    getCameras()
      .then(list => setStats({ cameras: list.length }))
      .catch(() => {});
  }, []);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div className="panel" style={{ margin: 0 }}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 6 }}>Cameras</div>
          <div style={{ fontSize: 31, fontWeight: 700 }}>{stats.cameras}</div>
        </div>
      </div>
      <div className="panel" style={{ color: "var(--muted)", fontSize: 15 }}>
        Welcome to GuardVision — select a section from the sidebar to get started.
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession]   = useState(loadSession);
  const [authMode, setAuthMode] = useState("login");
  const [page, setPage]         = useState("home");

  function handleLogout() {
    localStorage.removeItem("vfr_token");
    localStorage.removeItem("vfr_id");
    setToken("");
    setSession(null);
  }

  useEffect(() => { setUnauthorizedHandler(handleLogout); }, []);

  function handleLogin(accessToken, identity) {
    localStorage.setItem("vfr_token", accessToken);
    localStorage.setItem("vfr_id", JSON.stringify(identity));
    setToken(accessToken);
    setSession({ token: accessToken, identity });
  }

  if (!session) {
    return authMode === "register"
      ? <Register onLogin={handleLogin} onSwitch={() => setAuthMode("login")} />
      : <Login    onLogin={handleLogin} onSwitch={() => setAuthMode("register")} />;
  }

  return (
    <AppLayout page={page} setPage={setPage} user={session.identity} onLogout={handleLogout}>
{page === "home"        && <HomePage />}
      {page === "camera-add"  && <AddCamera onAdded={() => {}} />}
      {page === "camera-live" && <ViewCamera />}
      {page.startsWith("feat/") && (() => {
        const [, grp, key] = page.split("/");
        return <FeaturesPage group={grp} featureKey={key} />;
      })()}
      {page === "settings"    && <SettingsPage identity={session.identity} />}
    </AppLayout>
  );
}
