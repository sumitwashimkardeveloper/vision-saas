import { useState } from "react";
import { login } from "../../api/client.js";
import PasswordInput from "../../components/ui/PasswordInput.jsx";

export default function Login({ onLogin, onSwitch }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!username.trim() || !password) { setErr("Enter your username and password"); return; }
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
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h2>Sign in</h2>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" autoFocus />
        <PasswordInput value={password} onChange={e => setPassword(e.target.value)} />
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="err">{err}</div>
        <div className="auth-switch">
          New here?{" "}
          <button type="button" className="linkbtn" onClick={onSwitch}>Create a new account</button>
        </div>
      </form>
    </div>
  );
}
