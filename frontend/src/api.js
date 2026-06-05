// Tiny API client. Requests use root-absolute paths ("/auth/login", ...) which
// hit FastAPI directly in production and go through the Vite proxy in dev.

let token = localStorage.getItem("vfr_token") || "";
let onUnauthorized = () => {};

export function setToken(value) {
  token = value || "";
  if (token) localStorage.setItem("vfr_token", token);
  else localStorage.removeItem("vfr_token");
}

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn || (() => {});
}

async function errorText(res) {
  try {
    const body = await res.json();
    return body.detail || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function request(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (token) headers.set("Authorization", "Bearer " + token);
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401 || res.status === 403) {
    onUnauthorized();
    throw new Error("Unauthorized");
  }
  return res;
}

export async function getJson(path) {
  const res = await request(path);
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export async function postJson(path, body) {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export async function postForm(path, formData) {
  const res = await request(path, { method: "POST", body: formData });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export async function putForm(path, formData) {
  const res = await request(path, { method: "PUT", body: formData });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export async function del(path) {
  const res = await request(path, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}

export async function getBlob(path) {
  const res = await request(path);
  if (!res.ok) throw new Error(await errorText(res));
  return res.blob();
}

// Pull a human-readable message out of an auth error response. FastAPI sends
// `detail` as a string for our 400/401/409s, or an array for 422 validation.
async function authError(res, fallback) {
  try {
    const body = await res.json();
    const d = body.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length) return d[0].msg || fallback;
  } catch {
    /* non-JSON body */
  }
  return fallback;
}

// Auth endpoints are unauthenticated, so they bypass the bearer-token wrapper.
export async function login(username, password) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(await authError(res, "Invalid credentials"));
  return res.json();
}

export async function register(payload) {
  const res = await fetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await authError(res, "Registration failed"));
  return res.json();
}
