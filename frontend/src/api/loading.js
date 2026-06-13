import { getJson, putJson, postJson } from "./client.js";

export const getLoadingConfig       = ()          => getJson("/loading/config");
export const saveLoadingConfig      = (body)      => putJson("/loading/config", body);
export const getCameraLoadingCounts = (cameraId)  => getJson(`/loading/counts/${cameraId}`);
export const getAllLoadingCounts     = ()          => getJson("/loading/counts");
export const startLoadingCamera      = (cameraId)  => postJson(`/loading/cameras/${cameraId}/start`);
export const stopLoadingCamera       = (cameraId)  => postJson(`/loading/cameras/${cameraId}/stop`);
export const resetLoadingCamera      = (cameraId)  => postJson(`/loading/cameras/${cameraId}/reset`);

// Live annotated MJPEG feed URL (token in query so it works as an <img> src).
export const loadingStreamUrl = (cameraId) => {
  const token = localStorage.getItem("vfr_token") || "";
  return `/loading/cameras/${cameraId}/stream?token=${encodeURIComponent(token)}`;
};
