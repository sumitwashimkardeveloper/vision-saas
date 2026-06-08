import { useState, useEffect, useCallback } from "react";
import { getCameras } from "../../api/cameras.js";
import AddCamera from "./AddCamera.jsx";
import CameraList from "./CameraList.jsx";
import ViewCamera from "./ViewCamera.jsx";

export default function CamerasPage() {
  const [cameras, setCameras] = useState([]);
  const [view, setView]       = useState("live");

  const load = useCallback(() => getCameras().then(setCameras).catch(console.error), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="nav" style={{ marginBottom: 16 }}>
        <button className={view === "live" ? "active" : ""} onClick={() => setView("live")}>Live</button>
        <button className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>Manage</button>
      </div>

      {view === "live" && <ViewCamera cameras={cameras} />}

      {view === "manage" && (
        <>
          <AddCamera onAdded={load} />
          <CameraList cameras={cameras} onRefresh={load} />
        </>
      )}
    </div>
  );
}
