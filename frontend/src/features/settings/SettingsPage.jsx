import { useState } from "react";
import { patchJson } from "../../api/client.js";
import PasswordInput from "../../components/ui/PasswordInput.jsx";

export default function SettingsPage({ identity }) {
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg]         = useState("");
  const [err, setErr]         = useState("");
  const [busy, setBusy]       = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    if (!current)           return setErr("Current password is required");
    if (next.length < 8)    return setErr("New password must be at least 8 characters");
    if (next !== confirm)   return setErr("Passwords do not match");
    setBusy(true);
    try {
      const r = await patchJson("/auth/me/password", {
        current_password: current,
        new_password: next,
        confirm_password: confirm,
      });
      setMsg(r.message);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="settings-section">
        <h3>Account</h3>
        <div className="settings-row">
          <span className="settings-label">Username</span>
          <span>{identity.username || "—"}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Tenant ID</span>
          <span>{identity.tenant_id}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Role</span>
          <span>{identity.role}</span>
        </div>
      </div>

      <div className="settings-section">
        <h3>Change password</h3>
        <form onSubmit={changePassword} className="settings-form">
          <label>Current password</label>
          <PasswordInput value={current} onChange={e => setCurrent(e.target.value)} placeholder="Current password" />
          <label>New password</label>
          <PasswordInput value={next} onChange={e => setNext(e.target.value)} placeholder="New password (min 8 characters)" />
          <label>Confirm new password</label>
          <PasswordInput value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password" />
          {err && <p className="err">{err}</p>}
          {msg && <p style={{ color: "#4caf50", margin: 0 }}>{msg}</p>}
          <button type="submit" disabled={busy} style={{ alignSelf: "flex-start" }}>
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </section>
  );
}
