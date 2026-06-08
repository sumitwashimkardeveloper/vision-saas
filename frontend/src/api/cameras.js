import { getJson, postJson, del } from "./client.js";

export const getCameras = ()                     => getJson("/cameras");
export const addCamera  = (name, rtsp_url)       => postJson("/cameras", { name, rtsp_url, enabled: true });
export const updateCamera = (name, rtsp_url, enabled) => postJson("/cameras", { name, rtsp_url, enabled });
export const deleteCamera = (id)                 => del("/cameras/" + id);
