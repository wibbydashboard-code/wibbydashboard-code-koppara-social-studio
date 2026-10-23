export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** Errores por campo cuando el servidor los devuelve como objeto plano. */
  get fields(): Record<string, string> {
    const d = this.details;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      return Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    }
    return {};
  }
}

let currentUserId: string | null = null;
try {
  currentUserId = localStorage.getItem('kss.user');
} catch {
  /* almacenamiento no disponible */
}

export function setActingUser(id: string) {
  currentUserId = id;
  try {
    localStorage.setItem('kss.user', id);
  } catch {
    /* ignorar */
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (currentUserId) headers['x-user-id'] = currentUserId;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'network', 'No hay conexión con el servidor. Revisa que la app siga en marcha.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.code ?? 'error', data.message ?? 'Algo salió mal.', data.details);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: (url: string) => request<void>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form),
};
