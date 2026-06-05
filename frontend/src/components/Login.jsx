import { useState } from "react";
import { login } from "../api.js";

export default function Login({ onLogin }) {
  const [tenant, setTenant] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const data = await login(tenant.trim(), username.trim(), password);
      onLogin(data.access_token, { tenant_id: data.tenant_id, role: data.role });
    } catch {
      setErr("Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h2>Sign in</h2>
        <input
          value={tenant}
          onChange={(e) => setTenant(e.target.value)}
          placeholder="Tenant ID (e.g. tenant_001)"
          autoFocus
        />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="err">{err}</div>
      </form>
    </div>
  );
}
