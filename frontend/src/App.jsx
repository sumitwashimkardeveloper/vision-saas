import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useParams } from "react-router-dom";
import { setToken, setUnauthorizedHandler } from "./api/client.js";
import Login from "./features/auth/Login.jsx";
import Register from "./features/auth/Register.jsx";
import AppLayout from "./layout/AppLayout.jsx";
import AddCamera from "./features/cameras/AddCamera.jsx";
import ViewCamera from "./features/cameras/ViewCamera.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import FeaturesPage from "./features/ppe/FeaturesPage.jsx";
import AddFeaturesPage from "./features/ppe/AddFeaturesPage.jsx";
import ManageFeaturesPage from "./features/ppe/ManageFeaturesPage.jsx";
import PeoplePage from "./features/people/PeoplePage.jsx";
import EventsPage from "./features/events/EventsPage.jsx";
import AttendancePage from "./features/management/AttendancePage.jsx";
import SecurityPage from "./features/management/SecurityPage.jsx";
import SafetyPage   from "./features/management/SafetyPage.jsx";
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

// Reads the /features/:group/:feature URL params and renders the feature page.
function FeatureRoute() {
  const { group, feature } = useParams();
  return <FeaturesPage group={group} featureKey={feature} />;
}

export default function App() {
  const [session, setSession] = useState(loadSession);
  const navigate = useNavigate();

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

  // Logged out: only the auth screens exist; everything else redirects to /login.
  if (!session) {
    return (
      <Routes>
        <Route path="/login"    element={<Login    onLogin={handleLogin} onSwitch={() => navigate("/register")} />} />
        <Route path="/register" element={<Register onLogin={handleLogin} onSwitch={() => navigate("/login")} />} />
        <Route path="*"         element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Logged in: the dashboard layout wraps every screen as nested routes.
  return (
    <Routes>
      <Route element={<AppLayout user={session.identity} onLogout={handleLogout} />}>
        <Route path="/"                          element={<HomePage />} />
        <Route path="/cameras/add"               element={<AddCamera onAdded={() => {}} />} />
        <Route path="/cameras/live"              element={<ViewCamera />} />
        <Route path="/people"                    element={<PeoplePage />} />
        <Route path="/features/add"              element={<AddFeaturesPage />} />
        <Route path="/features/manage"           element={<ManageFeaturesPage />} />
        <Route path="/features/:group/:feature"  element={<FeatureRoute />} />
        <Route path="/events"                        element={<EventsPage />} />
        <Route path="/management/attendance"         element={<AttendancePage />} />
        <Route path="/management/security"           element={<SecurityPage />} />
        <Route path="/management/safety"             element={<SafetyPage />} />
        <Route path="/settings"                      element={<SettingsPage identity={session.identity} />} />
        {/* Visiting the auth URLs while logged in goes home. */}
        <Route path="/login"    element={<Navigate to="/" replace />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
