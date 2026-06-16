import { useState } from "react";
import Modal from "../../../components/ui/Modal.jsx";
import PasswordInput from "../../../components/ui/PasswordInput.jsx";
import { discoverNVRs, findNVRs, scanNVR, addCamera } from "../../../api/cameras.js";

const STEP_DISCOVER = "discover";
const STEP_CONNECT = "connect";
const STEP_RESULTS = "results";

function deviceKey(device) {
  return `${device.ip}:${device.port}:${device.xaddr || ""}`;
}

function maskRtsp(url) {
  return url.replace(/:\/\/[^@]+@/, "://***@");
}

function serviceLabel(device) {
  if (!device?.xaddr) return `${device?.ip || ""}:${device?.port || ""}`;
  try {
    const url = new URL(device.xaddr);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return `${device.ip}:${device.port}`;
  }
}

export default function SearchByNVRModal({ onClose, onAdded }) {
  const [step,     setStep]     = useState(STEP_DISCOVER);
  const [devices,  setDevices]  = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [candidateChannels, setCandidateChannels] = useState({});
  const [ip,       setIp]       = useState("");
  const [port,     setPort]     = useState("80");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [finding, setFinding] = useState(false);
  const [adding,   setAdding]   = useState(false);
  const [err,      setErr]      = useState("");

  async function handleDiscover() {
    setErr("");
    setCandidateChannels({});
    setDiscovering(true);
    try {
      const result = await discoverNVRs();
      const found = result.devices || [];
      setDevices(found);
      if (found.length === 1) {
        setSelectedDevice(deviceKey(found[0]));
        setIp(found[0].ip);
        setPort(String(found[0].port || 80));
        setStep(STEP_CONNECT);
      }
    } catch (ex) {
      setErr(ex.message || "Failed to search the LAN for NVR devices.");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleFindNVR(e) {
    e.preventDefault();
    if (!username.trim()) { setErr("Username is required."); return; }
    setErr("");
    setFinding(true);
    setCandidateChannels({});
    try {
      const result = await findNVRs(username.trim(), password);
      const found = result.candidates || [];
      const cached = {};
      for (const device of found) {
        cached[deviceKey(device)] = device.channels || [];
      }
      setDevices(found);
      setCandidateChannels(cached);

      if (!found.length) {
        setSelectedDevice("");
        setErr(`No NVR returned camera channels with this login. Tested ${result.tested || 0} ONVIF device${result.tested === 1 ? "" : "s"}.`);
        return;
      }

      const best = found[0];
      setSelectedDevice(deviceKey(best));
      setIp(best.ip);
      setPort(String(best.port || 80));

      if (found.length === 1) {
        const foundChannels = best.channels || [];
        setChannels(foundChannels);
        setSelected(new Set(foundChannels.map(c => c.token)));
        setStep(STEP_RESULTS);
      }
    } catch (ex) {
      setErr(ex.message || "Failed to find an NVR with these credentials.");
    } finally {
      setFinding(false);
    }
  }

  function useSelectedDevice() {
    const device = devices.find(d => deviceKey(d) === selectedDevice);
    if (!device) {
      setErr("Select an NVR candidate or use manual IP.");
      return;
    }
    setIp(device.ip);
    setPort(String(device.port || 80));
    setErr("");
    const cachedChannels = candidateChannels[deviceKey(device)];
    if (cachedChannels?.length) {
      setChannels(cachedChannels);
      setSelected(new Set(cachedChannels.map(c => c.token)));
      setStep(STEP_RESULTS);
      return;
    }
    setStep(STEP_CONNECT);
  }

  function useManualIp() {
    setSelectedDevice("");
    setCandidateChannels({});
    setIp("");
    setPort("80");
    setErr("");
    setStep(STEP_CONNECT);
  }

  async function handleScan(e) {
    e.preventDefault();
    if (!ip.trim())       { setErr("NVR IP address is required."); return; }
    if (!username.trim()) { setErr("Username is required."); return; }
    setErr("");
    setScanning(true);
    try {
      const result = await scanNVR(
        ip.trim(),
        port || "80",
        username.trim(),
        password,
        isUsingDiscoveredDevice ? selectedFoundDevice.xaddr : undefined
      );
      setChannels(result.channels);
      setSelected(new Set(result.channels.map(c => c.token)));
      setStep(STEP_RESULTS);
    } catch (ex) {
      setErr(ex.message || "Failed to connect to NVR.");
    } finally {
      setScanning(false);
    }
  }

  function toggleChannel(token) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(token) ? next.delete(token) : next.add(token);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === channels.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(channels.map(c => c.token)));
    }
  }

  async function handleAdd() {
    const toAdd = channels.filter(c => selected.has(c.token));
    if (!toAdd.length) { setErr("Select at least one camera to add."); return; }
    setErr("");
    setAdding(true);
    const errors = [];
    for (const ch of toAdd) {
      try {
        await addCamera(ch.name, ch.rtsp_url);
      } catch (ex) {
        errors.push(`${ch.name}: ${ex.message}`);
      }
    }
    setAdding(false);
    if (errors.length) {
      setErr(`Some cameras failed to add:\n${errors.join("\n")}`);
    } else {
      onAdded();
      onClose();
    }
  }

  const selectedFoundDevice = devices.find(d => deviceKey(d) === selectedDevice);
  const isUsingDiscoveredDevice =
    selectedFoundDevice && selectedFoundDevice.ip === ip && String(selectedFoundDevice.port || 80) === String(port || 80);
  const title =
    step === STEP_DISCOVER ? "Find NVR on LAN" :
    step === STEP_CONNECT ? "Connect to NVR" :
    `Found ${channels.length} Camera${channels.length !== 1 ? "s" : ""}`;

  return (
    <Modal title={title} onClose={onClose}>
      {step === STEP_DISCOVER && (
        <form className="modal-body" onSubmit={handleFindNVR}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            Enter the NVR login once. The server will search the LAN and show only devices that return camera channels with these credentials.
          </div>

          <div className="modal-row-2">
            <div className="modal-field">
              <label>NVR Username</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label>NVR Password</label>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 270, overflowY: "auto" }}>
            {(discovering || finding) && (
              <div className="nvr-search-state">
                <div className="nvr-search-spinner" aria-hidden="true" />
                <div className="nvr-search-copy">
                  <div className="nvr-search-title">{finding ? "Finding NVR channels" : "Scanning local network"}</div>
                  <div className="nvr-search-subtitle">
                    {finding ? "Testing discovered devices with this NVR login." : "Looking for ONVIF devices on this LAN."}
                  </div>
                </div>
                <div className="nvr-search-bar" aria-hidden="true">
                  <span />
                </div>
              </div>
            )}

            {!discovering && !finding && devices.length === 0 && (
              <div style={{ padding: "12px 10px", border: "1px solid var(--line)", borderRadius: 6 }}>
                <div style={{ fontWeight: 600, color: "var(--fg)", marginBottom: 3 }}>No NVR candidates yet</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  Start the NVR search with username and password, or use manual IP if you already know the NVR address.
                </div>
              </div>
            )}

            {!discovering && !finding && devices.map(device => {
              const key = deviceKey(device);
              const cachedChannels = candidateChannels[key] || [];
              return (
                <label
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: selectedDevice === key ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="nvr-device"
                    checked={selectedDevice === key}
                    onChange={() => setSelectedDevice(key)}
                    style={{ marginTop: 3, cursor: "pointer" }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: "var(--fg)" }}>{device.name || "ONVIF device"}</span>
                      {device.is_nvr && (
                        <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 7px" }}>
                          NVR
                        </span>
                      )}
                      {cachedChannels.length > 0 && (
                        <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-soft)", border: "1px solid var(--line)", borderRadius: 999, padding: "1px 7px" }}>
                          {cachedChannels.length} channels
                        </span>
                      )}
                    </span>
                    <span style={{ display: "block", fontFamily: "monospace", fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                      {serviceLabel(device)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {err && <div className="err">{err}</div>}

          <div className="modal-actions">
            <button type="submit" disabled={finding || discovering}>
              {finding ? "Finding..." : "Find NVR & Scan Cameras"}
            </button>
            <button type="button" onClick={useSelectedDevice} disabled={finding || discovering || !selectedDevice}>
              Use Selected
            </button>
            <button type="button" className="ghost" onClick={handleDiscover} disabled={finding || discovering}>
              {discovering ? "Searching..." : "Show All ONVIF Devices"}
            </button>
            <button type="button" className="ghost" onClick={useManualIp}>
              Enter IP Manually
            </button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}

      {step === STEP_CONNECT && (
        <form className="modal-body" onSubmit={handleScan}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Enter the NVR username and password. All cameras connected to this NVR will be discovered automatically.
          </div>
          {isUsingDiscoveredDevice && (
            <div style={{ padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Selected NVR</div>
                <div style={{ fontWeight: 700, color: "var(--fg)" }}>{selectedFoundDevice.name || "ONVIF device"}</div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>{serviceLabel(selectedFoundDevice)}</div>
              </div>
              <button type="button" className="ghost" onClick={() => { setStep(STEP_DISCOVER); setErr(""); }}>
                Change
              </button>
            </div>
          )}
          {!isUsingDiscoveredDevice && (
            <div className="modal-row-2">
              <div className="modal-field" style={{ flex: 2 }}>
                <label>NVR IP Address</label>
                <input
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                  placeholder="192.168.1.100"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className="modal-field" style={{ flex: 1 }}>
                <label>Port</label>
                <input
                  value={port}
                  onChange={e => setPort(e.target.value)}
                  placeholder="80"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
          <div className="modal-row-2">
            <div className="modal-field">
              <label>Username</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
              />
            </div>
            <div className="modal-field">
              <label>Password</label>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="modal-actions">
            <button type="submit" disabled={scanning}>
              {scanning ? "Scanning..." : "Connect & Scan Cameras"}
            </button>
            <button type="button" className="ghost" onClick={() => { setStep(STEP_DISCOVER); setErr(""); }}>
              Back
            </button>
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}

      {step === STEP_RESULTS && (
        <div className="modal-body">
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 12 }}>
            Select the cameras you want to add. Main streams are used when the NVR exposes both main and sub streams.
          </div>

          {/* Select All toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
            <input
              type="checkbox"
              id="nvr-all"
              checked={selected.size === channels.length && channels.length > 0}
              onChange={toggleAll}
              style={{ width: 15, height: 15, cursor: "pointer" }}
            />
            <label htmlFor="nvr-all" style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--fg)", userSelect: "none" }}>
              Select All ({channels.length})
            </label>
          </div>

          {/* Channel list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto", marginBottom: 12 }}>
            {channels.map(ch => (
              <label
                key={ch.token}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: selected.has(ch.token) ? "rgba(79,140,255,0.06)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(ch.token)}
                  onChange={() => toggleChannel(ch.token)}
                  style={{ width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--fg)" }}>{ch.name}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {maskRtsp(ch.rtsp_url)}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {err && <div className="err" style={{ whiteSpace: "pre-line" }}>{err}</div>}

          <div className="modal-actions">
            <button onClick={handleAdd} disabled={adding || selected.size === 0}>
              {adding ? "Adding…" : `Add ${selected.size} Camera${selected.size !== 1 ? "s" : ""}`}
            </button>
            <button className="ghost" onClick={() => { setStep(STEP_CONNECT); setErr(""); }}>
              Back
            </button>
            <button className="ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
