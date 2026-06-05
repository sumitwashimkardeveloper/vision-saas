import { useEffect, useState } from "react";
import { setToken, setUnauthorizedHandler } from "./api.js";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";

function loadSession() {
  const token = localStorage.getItem("vfr_token") || "";
  const identity = JSON.parse(localStorage.getItem("vfr_id") || "null");
  return token && identity ? { token, identity } : null;
}

export default function App() {
  // api.js already reads the token from localStorage at import time, so a
  // refresh keeps working without waiting for an effect.
  const [session, setSession] = useState(loadSession);

  function handleLogout() {
    localStorage.removeItem("vfr_token");
    localStorage.removeItem("vfr_id");
    setToken("");
    setSession(null);
  }

  // Register the global 401/403 handler once.
  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
  }, []);

  function handleLogin(accessToken, identity) {
    localStorage.setItem("vfr_token", accessToken);
    localStorage.setItem("vfr_id", JSON.stringify(identity));
    setToken(accessToken);
    setSession({ token: accessToken, identity });
  }

  return session ? (
    <Dashboard identity={session.identity} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
}
