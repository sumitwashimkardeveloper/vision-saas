import { useState } from "react";
import { login } from "../../api/client.js";
import PasswordInput from "../../components/ui/PasswordInput.jsx";

export default function Login({ onLogin, onSwitch }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [terms,    setTerms]    = useState(false);
  const [err,      setErr]      = useState("");
  const [busy,     setBusy]     = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!username.trim() || !password) { setErr("Enter your username and password"); return; }
    if (!terms) { setErr("You must accept the Terms & Privacy Policy"); return; }
    setBusy(true);
    try {
      const data = await login(username.trim(), password);
      onLogin(data.access_token, { tenant_id: data.tenant_id, role: data.role, username: data.username || "" });
    } catch (ex) {
      setErr(ex.message || "Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-dots" />
      <div className="auth-card">
        <div className="auth-logo">
          <img src={`${import.meta.env.BASE_URL}assets/logo.webp`} alt="GuardVision" className="auth-logo-img" />
        </div>
        <h2 className="auth-title">Sign In</h2>
        <p className="auth-subtitle">Welcome back! Please sign in to your account.</p>
        <form onSubmit={submit}>
          <div className="auth-field">
            <span className="auth-field-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <input
              className="auth-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Username"
              autoFocus
            />
          </div>
          <div className="auth-field">
            <span className="auth-field-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
          </div>
          <label className="auth-check">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <label className="auth-check">
            <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
            <span>
              I agree to the{" "}
              <a href="#" onClick={e => e.preventDefault()}>Terms</a>{" "}and{" "}
              <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>
            </span>
          </label>
          {err && <div className="auth-err">{err}</div>}
          <button className="auth-btn" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="auth-or"><span>OR</span></div>
        <div className="auth-switch">
          New here?{" "}
          <button type="button" className="auth-link" onClick={onSwitch}>Create a new account</button>
        </div>
      </div>
    </div>
  );
}
