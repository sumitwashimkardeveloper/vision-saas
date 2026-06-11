import { useState } from "react";
import { register } from "../../api/client.js";
import PasswordInput from "../../components/ui/PasswordInput.jsx";

const SLUG = /^[A-Za-z0-9_-]+$/;

function validate({ username, password, confirm, terms }) {
  if (!username.trim())           return "Username is required";
  if (username.trim().length < 3) return "Username must be at least 3 characters";
  if (!SLUG.test(username.trim())) return "Username may only contain letters, numbers, '-' and '_'";
  if (password.length < 8)        return "Password must be at least 8 characters";
  if (password !== confirm)        return "Passwords do not match";
  if (!terms)                      return "You must accept the Terms & Privacy Policy";
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
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h2>Create account</h2>
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          autoFocus
        />
        <PasswordInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 8 characters)" />
        <PasswordInput value={confirm}  onChange={e => setConfirm(e.target.value)}  placeholder="Confirm password" />
        <label className="terms">
          <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
          <span>
            I agree to the <a href="#" onClick={e => e.preventDefault()}>Terms</a> and{" "}
            <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>
          </span>
        </label>
        <button disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <div className="err">{err}</div>
        <div className="auth-switch">
          Already have an account?{" "}
          <button type="button" className="linkbtn" onClick={onSwitch}>Sign in</button>
        </div>
      </form>
    </div>
  );
}
