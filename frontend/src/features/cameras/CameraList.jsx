import { deleteCamera } from "../../api/cameras.js";

export default function CameraList({ cameras, onRefresh }) {
  async function remove(id) {
    if (!confirm("Delete this camera?")) return;
    await deleteCamera(id);
    onRefresh();
  }

  if (!cameras.length) {
    return <p style={{ color: "var(--muted)", fontSize: 15 }}>No cameras added yet.</p>;
  }

  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>RTSP URL</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cameras.map(cam => (
            <tr key={cam.id}>
              <td>{cam.name}</td>
              <td style={{ fontFamily: "monospace", fontSize: 14, color: "var(--muted)", maxWidth: 360, wordBreak: "break-all" }}>
                {cam.rtsp_url}
              </td>
              <td>
                <span className="tag" style={{ background: cam.enabled ? "color-mix(in srgb, var(--success) 10%, transparent)" : undefined, color: cam.enabled ? "var(--success)" : undefined }}>
                  {cam.enabled ? "enabled" : "disabled"}
                </span>
              </td>
              <td>
                <button className="danger" style={{ padding: "4px 10px", fontSize: 14 }} onClick={() => remove(cam.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
