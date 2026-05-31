import axios from 'axios'

// ─── Base URL ────────────────────────────────────────────────────────────────
// Development: Vite proxies /api → localhost:8000 (set in vite.config.js)
// Production:  Set VITE_API_URL=https://datamend-tqu5.onrender.com in Render env vars
const BASE_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, '') + '/api'
  : '/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,   // 60s — Render free tier can be slow
  headers: { 'Content-Type': 'application/json' },
})

// Log which backend we're talking to (visible in browser console)
console.log('[DataFlow] API base:', BASE_URL)

// ─── Request interceptor — helps debug undefined IDs ─────────────────────────
api.interceptors.request.use(req => {
  // Catch undefined in URLs before the request is sent
  if (req.url && req.url.includes('undefined')) {
    console.error('[DataFlow] URL contains undefined:', req.url, req)
    // Don't throw — let it go so we get the actual server error for debugging
  }
  return req
})

// ─── Response interceptor — surface errors clearly ───────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    console.error('[DataFlow] API error:', err.config?.url, err.response?.status, err.response?.data)
    return Promise.reject(err)
  }
)

// ── Projects ──────────────────────────────────────────────────────────────────
export const getProjects        = ()         => api.get('/projects/')
export const createProject      = (data)     => api.post('/projects/', data)
export const getProject         = (id)       => api.get(`/projects/${id}`)
export const updateProject      = (id, data) => api.patch(`/projects/${id}`, data)
export const deleteProject      = (id)       => api.delete(`/projects/${id}`)
export const getProjectWorkbooks = (id)      => api.get(`/projects/${id}/workbooks`)

// ── Files ─────────────────────────────────────────────────────────────────────
export const uploadFile = (projectId, file, onProgress) => {
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('file', file)
  return api.post('/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress && onProgress(Math.round(e.loaded / e.total * 100)),
    timeout: 120000,   // 2 min for large files
  })
}

export const confirmSheet = (projectId, tempId, filePath, filename, sheetName, importAll = false) => {
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('temp_id', tempId)
  form.append('file_path', filePath)
  form.append('filename', filename)
  form.append('sheet_name', sheetName)
  form.append('import_all', importAll ? 'true' : 'false')
  return api.post('/files/confirm-sheet', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const saveEdits   = (workbookId, rows) => api.post(`/files/${workbookId}/save-edits`, { rows })
export const getWorkbook = (id)               => api.get(`/files/${id}`)
export const getPreview  = (id, params)       => api.get(`/files/${id}/preview`, { params })
export const deleteWorkbook = (id)            => api.delete(`/files/${id}`)

// ── Mapping ───────────────────────────────────────────────────────────────────
export const getMapping       = (workbookId) => api.get(`/mapping/${workbookId}`)
export const saveMapping      = (data)       => api.post('/mapping/save', data)
export const aiSuggestMapping = (data)       => api.post('/mapping/ai-suggest', data)
export const suggestSchema    = (workbookId) => api.post(`/mapping/suggest-schema?workbook_id=${workbookId}`)

// ── Validation ────────────────────────────────────────────────────────────────
export const runValidation       = (data)        => api.post('/validation/run', data)
export const getValidationSummary = (workbookId) => api.get(`/validation/${workbookId}/summary`)
export const getInsights         = (workbookId)  => api.post(`/validation/${workbookId}/insights`)

// ── Transform ─────────────────────────────────────────────────────────────────
export const createAiTransform  = (data)        => api.post('/transform/ai-transform', data)
export const applyTransform     = (data)        => api.post('/transform/apply', data)
export const runAutofix         = (data)        => api.post('/transform/autofix', data)
export const getTransformHistory = (workbookId) => api.get(`/transform/${workbookId}/history`)

// ── Export ────────────────────────────────────────────────────────────────────
export const exportDownload = async (data) => {
  const resp = await api.post('/export/download', data, {
    responseType: 'blob',
    timeout: 120000,
  })
  const cd = resp.headers['content-disposition'] || ''
  const match = cd.match(/filename="(.+)"/)
  const filename = match ? match[1] : 'export.' + data.format
  const url = URL.createObjectURL(new Blob([resp.data]))
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
  return { filename, rowCount: resp.headers['x-row-count'] }
}

export const createWebhook = (projectId, data) => api.post('/export/webhooks?project_id=' + projectId, data)
export const listWebhooks  = (projectId)       => api.get('/export/webhooks/' + projectId)
export const pushWebhook   = (data)            => api.post('/export/webhooks/push', data)
export const deleteWebhook = (id)              => api.delete('/export/webhooks/' + id)

export default api
