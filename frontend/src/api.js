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

// Login is unauthenticated, so it bypasses the bearer-token request wrapper.
export async function login(tenantId, username, password) {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId, username, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  return res.json();
}
