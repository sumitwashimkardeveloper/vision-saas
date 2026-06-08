import { useEffect, useState } from "react";
import { setToken, setUnauthorizedHandler, getJson, postJson } from "./api/client.js";
import Login from "./features/auth/Login.jsx";
import Register from "./features/auth/Register.jsx";
import AppLayout from "./layout/AppLayout.jsx";
import AddCamera from "./features/cameras/AddCamera.jsx";
import ViewCamera from "./features/cameras/ViewCamera.jsx";
import PeoplePage from "./features/people/PeoplePage.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import { getCameras } from "./api/cameras.js";

function loadSession() {
  const token    = localStorage.getItem("vfr_token") || "";
  const identity = JSON.parse(localStorage.getItem("vfr_id") || "null");
  return token && identity ? { token, identity } : null;
}

function WorkerButton() {
  const [running, setRunning] = useState(false);
  const [busy, setBusy]       = useState(false);

  async function fetchStatus() {
    try { const s = await getJson("/worker/status"); setRunning(s.running); } catch {}
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, []);

  async function toggle() {
    setBusy(true);
    try { await postJson(running ? "/worker/stop" : "/worker/start"); await fetchStatus(); }
    catch {}
    finally { setBusy(false); }
  }

  return (
    <button className={`worker-btn${running ? " running" : ""}`} onClick={toggle} disabled={busy}>
      <span className={`status-dot${running ? " on" : ""}`} />
      {busy ? "…" : running ? "Stop worker" : "Start worker"}
    </button>
  );
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
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Cameras</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.cameras}</div>
        </div>
      </div>
      <div className="panel" style={{ color: "var(--muted)", fontSize: 13 }}>
        Welcome to VisionFR — select a section from the sidebar to get started.
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
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <WorkerButton />
      </div>
      {page === "home"        && <HomePage />}
      {page === "camera-add"  && <AddCamera onAdded={() => {}} />}
      {page === "camera-live" && <ViewCamera />}
      {page === "people"      && <PeoplePage />}
      {page === "settings"    && <SettingsPage identity={session.identity} />}
    </AppLayout>
  );
}
