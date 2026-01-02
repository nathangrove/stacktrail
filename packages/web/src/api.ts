export type Issue = {
  id: string;
  projectKey?: string;
  title: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  resolvedAt?: number | null;
  previousIssueId?: string | null;
};

export async function resolveIssue(issueId: string, resolved = true) {
  const res = await apiFetch(`${apiBase}/api/issues/${encodeURIComponent(issueId)}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ resolved })
  });
  if (!res.ok) throw new Error(`Failed to resolve issue: ${res.status}`);
  const json = await res.json();
  return json as { success: boolean; resolvedAt?: number | null }; 
}

export type EventRow = {
  id: string;
  occurredAt: number;
  payload: any;
};

export type Project = {
  projectKey: string;
  name: string;
  createdAt: number;
};

const apiBase =
  import.meta.env.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000");

// Global fetch wrapper used by the UI to intercept 401s and redirect to the
// login page for browser-based clients to avoid the native Basic Auth prompt.
async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status === 401) {
    // If running in a browser, redirect to the login page. For non-browser
    // clients (curl), we still throw so callers can handle the 401.
    if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      // Use location replace to avoid creating extra history entries.
      window.location.replace('/login');
    }
    const json = await res.json().catch(() => null as any);
    throw new Error(json?.error ?? 'Unauthorized');
  }
  return res;
} 

// Basic auth helpers (stored as base64 in localStorage under 'cet_basic_auth')
export function setAuth(username: string, password: string) {
  try {
    const v = btoa(`${username}:${password}`);
    localStorage.setItem('cet_basic_auth', v);
  } catch {
    // ignore
  }
}
export function clearAuth() {
  localStorage.removeItem('cet_basic_auth');
}
export function getAuthHeaders(): HeadersInit {
  try {
    const basic = typeof localStorage !== 'undefined' ? localStorage.getItem('cet_basic_auth') : null;
    const headers: Record<string, string> = {};
    if (basic) headers.Authorization = `Basic ${basic}`;
    return headers;
  } catch {
    return {};
  }
}


export async function fetchIssueEvents(projectKey: string, issueId: string): Promise<EventRow[]> {
  const res = await apiFetch(`${apiBase}/api/issues/${encodeURIComponent(issueId)}/events?projectKey=${encodeURIComponent(projectKey)}&limit=50`, {
    headers: { ...getAuthHeaders() }
  });
  if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
  const json = await res.json();
  return json.events as EventRow[]; 
}

export async function fetchIssues(projectKey: string, includeResolved = false): Promise<Issue[]> {
  const q = includeResolved ? '?includeResolved=1' : '';
  const res = await apiFetch(`${apiBase}/api/issues?projectKey=${encodeURIComponent(projectKey)}${q}`, {
    headers: { ...getAuthHeaders() }
  });
  if (!res.ok) throw new Error(`Failed to load issues: ${res.status}`);
  const json = await res.json();
  return json.issues as Issue[]; 
}

export async function fetchIssue(issueId: string, projectKey?: string) {
  const q = projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : '';
  const res = await apiFetch(`${apiBase}/api/issues/${encodeURIComponent(issueId)}${q}`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error(`Failed to load issue: ${res.status}`);
  const json = await res.json();
  return json as Issue; 
}

export async function createProject(projectKey: string, name?: string) {
  const res = await apiFetch(`${apiBase}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ projectKey, name })
  });
  if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);

  const json = await res.json();
  return json as { projectKey: string; ingestKey?: string }; 
}

export async function fetchProjectIngestKey(projectKey: string) {
  const res = await apiFetch(`${apiBase}/api/projects/${encodeURIComponent(projectKey)}/ingest-key`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error(`Failed to load ingest key: ${res.status}`);
  const json = await res.json();
  return json as { projectKey: string; ingestKey: string }; 
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await apiFetch(`${apiBase}/api/projects`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error(`Failed to load projects: ${res.status}`);
  const json = await res.json();
  return json.projects as Project[]; 
}

// Session-based auth for the UI
export async function login(username: string, password: string) {
  const res = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null as any);
    console.log(json);
    throw new Error(json?.error ?? `Login failed: ${res.status}`);
  }
  return await res.json();
}

export async function logout() {
  const res = await fetch(`${apiBase}/auth/logout`, {
    method: 'POST',
    headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    credentials: 'include'
  });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
  return await res.json();
}

export async function fetchSession() {
  try {
    const res = await fetch(`${apiBase}/auth/session`, { credentials: 'include', headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' } });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      // Likely serving HTML (Vite origin). Try the typical proxied server at localhost:4000 as a fallback.
      if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        try {
          const fallback = `${window.location.protocol}//${window.location.hostname}:4000`;
          const fres = await fetch(`${fallback}/auth/session`, { credentials: 'include', headers: { 'accept': 'application/json', 'x-requested-with': 'XMLHttpRequest' } });
          if (!fres.ok) return null;
          const fjson = await fres.json();
          return fjson.user as { id: string; username: string } | null;
        } catch {
          return null;
        }
      }
      return null;
    }

    const json = await res.json();
    return json.user as { id: string; username: string } | null;
  } catch {
    return null;
  }
}

export async function deleteProject(projectKey: string) {
  const res = await apiFetch(`${apiBase}/api/projects/${encodeURIComponent(projectKey)}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null as any);
    throw new Error(json?.error ?? `Failed to delete project: ${res.status}`);
  }
  return { success: true }; 
}

export type User = {
  id: string;
  username: string;
  createdAt: number;
};

export type SourceMap = {
  id: string;
  fileName: string;
  uploadedAt: number;
};

export async function fetchSourceMaps(projectKey: string): Promise<SourceMap[]> {
  const res = await apiFetch(`${apiBase}/api/projects/${encodeURIComponent(projectKey)}/sourcemaps`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error(`Failed to load source maps: ${res.status}`);
  const json = await res.json();
  return json.sourcemaps as SourceMap[]; 
}

export async function uploadSourceMap(projectKey: string, fileName: string, mapContent: string) {
  const res = await apiFetch(`${apiBase}/api/projects/${encodeURIComponent(projectKey)}/sourcemaps`, {
    method: "POST",
    headers: { "content-type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ fileName, map: mapContent })
  });
  if (!res.ok) {
    if (res.status === 413) {
      const body = await res.json().catch(() => null as any);
      throw new Error(body?.message ?? "Uploaded file too large (max 10 MB)");
    }
    throw new Error(`Failed to upload source map: ${res.status}`);
  }
  const json = await res.json();
  return json; 
}

// Upload a zip archive to be extracted server-side (convenient for CI pipelines)
export async function uploadSourceMapArchive(projectKey: string, file: File | Blob) {
  const fd = new FormData();
  fd.append('file', file, (file as File).name ?? 'build.zip');
  const res = await apiFetch(`${apiBase}/api/projects/${encodeURIComponent(projectKey)}/sourcemaps/bulk`, {
    method: 'POST',
    headers: { ...getAuthHeaders() },
    body: fd
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null as any);
    throw new Error(body?.error ?? `Failed to upload archive: ${res.status}`);
  }
  const json = await res.json();
  return json as { uploaded: Array<{ id: string; fileName: string; uploadedAt: number }>; warnings?: string[] }; 
}
export async function deleteSourceMap(projectKey: string, id: string) {
  const res = await apiFetch(`${apiBase}/api/projects/${encodeURIComponent(projectKey)}/sourcemaps/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() }
  });
  if (!res.ok) throw new Error(`Failed to delete source map: ${res.status}`);
  const json = await res.json();
  return json as { success: boolean }; 
}

export async function fetchUsers(): Promise<User[]> {
  const res = await apiFetch(`${apiBase}/api/users`, { headers: { ...getAuthHeaders() } });
  if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
  const json = await res.json();
  return json.users as User[]; 
}

export async function createUser(username: string, password: string) {
  const res = await apiFetch(`${apiBase}/api/users`, {
    method: "POST",
    headers: { "content-type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.error || `Failed to create user: ${res.status}`);
  }
  const json = await res.json();
  return json as { id: string; username: string; createdAt: number }; 
}

export async function updateUserPassword(userId: string, password: string) {
  const res = await apiFetch(`${apiBase}/api/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ password })
  });
  if (!res.ok) throw new Error(`Failed to update user: ${res.status}`);
  const json = await res.json();
  return json as { success: boolean }; 
}

export async function deleteUser(userId: string) {
  const res = await apiFetch(`${apiBase}/api/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() }
  });
  if (!res.ok) {
    const json = await res.json();
    throw new Error(json.error || `Failed to delete user: ${res.status}`);
  }
  const json = await res.json();
  return json as { success: boolean };
}
