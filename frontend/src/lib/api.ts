/**
 * The one place the browser talks to the backend. Same-origin always: the
 * Vite dev server proxies /api to FastAPI, and in production FastAPI serves
 * the built SPA itself — so the session cookie rides along automatically.
 */

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // Session expired mid-use. The router guard handles the nice path; this is
  // the backstop for any API call it didn't cover. Auth endpoints are exempt
  // so a failed login shows its message instead of reloading the page.
  if (response.status === 401 && !path.startsWith("/api/auth/")) {
    window.location.assign("/login")
    throw new Error("Not authenticated")
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .then((data: { detail?: unknown }) => data.detail)
      .catch(() => undefined)
    throw new Error(
      typeof detail === "string" ? detail : `Request failed (${response.status})`,
    )
  }

  return response.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
}
