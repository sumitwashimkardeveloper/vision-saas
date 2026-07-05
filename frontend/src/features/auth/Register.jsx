import { useState } from "react";
import { register } from "../../api/client.js";
import PasswordInput from "../../components/ui/PasswordInput.jsx";

const SLUG = /^[A-Za-z0-9_-]+$/;

function validate({ username, password, confirm, terms }) {
  if (!username.trim())            return "Username is required";
  if (username.trim().length < 3)  return "Username must be at least 3 characters";
  if (!SLUG.test(username.trim())) return "Username may only contain letters, numbers, '-' and '_'";
  if (password.length < 8)         return "Password must be at least 8 characters";
  if (password !== confirm)         return "Passwords do not match";
  if (!terms)                       return "You must accept the Terms & Privacy Policy";
  return "";
}

export default function Register({ onLogin, onSwitch }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [terms,    setTerms]    = useState(false);
  const [err,      setErr]      = useState("");
  const [busy,     setBusy]     = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const msg = validate({ username, password, confirm, terms });
    if (msg) { setErr(msg); return; }
    setBusy(true);
    try {
      const data = await register({
        username: username.trim(),
        password,
        confirm_password: confirm,
        accept_terms: terms,
      });
      onLogin(data.access_token, { tenant_id: data.tenant_id, role: data.role, username: data.username || username.trim() });
    } catch (ex) {
      setErr(ex.message || "Registration failed");
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
        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">Create your account to get started</p>
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
            <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 8 characters)" />
          </div>
          <div className="auth-field">
            <span className="auth-field-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm password" />
          </div>
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
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <div className="auth-or"><span>OR</span></div>
        <div className="auth-switch">
          Already have an account?{" "}
          <button type="button" className="auth-link" onClick={onSwitch}>Sign in</button>
        </div>
      </div>
    </div>
  );
}
