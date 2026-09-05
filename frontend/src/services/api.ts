import axios from 'axios';
import type { GeometryPrepareResult, GeometryRecord, GeometryTransform, GeometryUploadResult, MeshPreviewPayload, VoxelizeResult } from '../types/geometry';
import type { SimulationCreatePayload, SimulationCreateResponse, SimulationRecord, SimulationResultsPayload } from '../types/simulation';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mmx_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((res) => res, async (err) => {
  const isRefreshRequest = err.config?.url === '/auth/refresh';
  if (err.response?.status === 401 && !err.config?._retry && !isRefreshRequest) {
    err.config._retry = true;
    const refreshToken = localStorage.getItem('mmx_refresh');
    if (refreshToken) {
      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { token: refreshToken });
        localStorage.setItem('mmx_token', data.access_token);
        err.config.headers.Authorization = `Bearer ${data.access_token}`;
        return api(err.config);
      } catch {
        localStorage.removeItem('mmx_token');
        localStorage.removeItem('mmx_refresh');
        if (window.location.pathname !== '/login') window.location.href = '/login';
      }
    }
  }
  return Promise.reject(err);
});
export default api;

// FastAPI's own request-validation errors (422, before a handler even runs)
// return `detail` as an array of {type,loc,msg,...} objects, not a string --
// unlike every HTTPException raised by this app's own route handlers, which
// always pass a plain string. Rendering `err.response?.data?.detail`
// directly as JSX crashes the whole page ("Objects are not valid as a React
// child") the moment such a validation error occurs. This normalizes both
// shapes into a displayable string.
export function getErrorMessage(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : String(item))).join('; ');
  }
  return fallback;
}

export const AuthAPI = {
  register: (email, password, fullName, company) => api.post('/auth/register', { email, password, full_name: fullName, company }),
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
};
export const FileAPI = {
  upload: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<GeometryUploadResult>('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  get: (geometryId: string) => api.get<GeometryRecord>(`/files/${geometryId}`),
  getPreview: (geometryId: string) => api.get<MeshPreviewPayload>(`/files/${geometryId}/preview`),
  prepare: (geometryId: string, transform: GeometryTransform) => api.post<GeometryPrepareResult>(`/files/${geometryId}/prepare`, transform),
  voxelize: (geometryId: string, resolution: number, fillInterior = true) =>
    api.post<VoxelizeResult>('/files/voxelize', { geometry_id: geometryId, resolution, fill_interior: fillInterior }),
};
export const SimulationAPI = {
  create: (cfg: SimulationCreatePayload) => api.post<SimulationCreateResponse>('/simulations/', cfg),
  get: (id: string) => api.get<SimulationRecord>(`/simulations/${id}`),
  getResults: (id: string) => api.get<SimulationResultsPayload>(`/simulations/${id}/results`),
  list: () => api.get('/simulations/'),
};
export const GeometryAPI = {
  list: () => api.get('/geometries/'),
  generate: (id, gridSize) => api.post(`/geometries/${id}/generate`, { grid_size: gridSize }),
};
