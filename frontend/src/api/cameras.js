import { getJson, postJson, patchJson, del } from "./client.js";

export const getCameras   = ()                          => getJson("/cameras");
export const addCamera    = (name, rtsp_url)            => postJson("/cameras", { name, rtsp_url, enabled: true });
export const updateCamera = (id, fields)                => patchJson(`/cameras/${id}`, fields);
export const toggleCamera = (id)                        => patchJson(`/cameras/${id}/toggle`);
export const deleteCamera = (id)                        => del("/cameras/" + id);

export const scanNVR = (ip, port, username, password) =>
  postJson("/nvr/scan", { ip, port: Number(port), username, password });
