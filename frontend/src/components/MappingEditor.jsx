import { useState, useEffect } from 'react'
import { Zap, Save, AlertCircle, CheckCircle2, PenLine } from 'lucide-react'
import toast from 'react-hot-toast'
import { getMapping, saveMapping, aiSuggestMapping, getPreview, saveEdits } from '../utils/api'
import WorkbookGrid from './WorkbookGrid'

export default function MappingEditor({ workbook, schema, onComplete }) {
  const [mapping, setMapping] = useState({})
  const [customNames, setCustomNames] = useState({})
  const [confidence, setConfidence] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState([])
  const [editedPreview, setEditedPreview] = useState([])
  const [headers, setHeaders] = useState([])
  const [tab, setTab] = useState('mapping')

  useEffect(() => { loadData() }, [workbook.id])

  const loadData = async () => {
    try {
      const [{ data: m }, { data: p }] = await Promise.all([
        getMapping(workbook.id),
        getPreview(workbook.id, { page: 1, page_size: 100 }),
      ])
      const savedMapping = m.column_mapping || {}
      const srcHeaders = m.source_headers || []
      setMapping(savedMapping)
      setHeaders(srcHeaders)
      setPreview(p.rows || [])
      setEditedPreview([...(p.rows || [])])
      // Pre-fill custom names with original column name for all unmapped cols
      const defaults = {}
      srcHeaders.forEach(col => {
        if (!savedMapping[col]) defaults[col] = col
      })
      setCustomNames(defaults)
    } catch {
      toast.error('Failed to load mapping')
    }
  }

  const handleAiMap = async () => {
    setAiLoading(true)
    try {
      const { data } = await aiSuggestMapping({ workbook_id: workbook.id, target_schema: schema })
      const newMapping = data.mapping || {}
      setMapping(newMapping)
      setConfidence(data.confidence || {})
      setSuggestions(data.suggestions || [])
      // For AI-mapped cols clear custom name; for still-unmapped keep original name
      setCustomNames(prev => {
        const updated = { ...prev }
        headers.forEach(col => {
          if (newMapping[col]) {
            delete updated[col]
          } else if (!updated[col]) {
            updated[col] = col
          }
        })
        return updated
      })
      const mappedCount = Object.values(newMapping).filter(Boolean).length
      toast.success('AI mapped ' + mappedCount + ' columns!')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'AI mapping failed')
    } finally {
      setAiLoading(false)
    }
  }

  const handleSave = async () => {
    const fullMapping = { ...mapping }
    headers.forEach(col => {
      if (!mapping[col] && customNames[col]) {
        fullMapping[col] = customNames[col]
      }
    })
    setSaving(true)

    // Step 1: Save cell edits (independent — failure here won't block mapping save)
    if (editedPreview.length > 0) {
      try {
        const saveRes = await saveEdits(workbook.id, editedPreview)
        if (saveRes.data && saveRes.data.saved) {
          console.log('Cell edits saved:', saveRes.data.row_count, 'rows')
        }
      } catch (e) {
        // Log the actual error so we can debug
        const status = e?.response?.status
        const detail = e?.response?.data?.detail || e?.message || 'Unknown'
        console.error('saveEdits failed:', status, detail, e)
        toast('Cell edits could not be saved (' + status + ': ' + detail + ')', {
          icon: '⚠',
          style: { background: '#1a1408', color: '#fbbf24', border: '1px solid #3f2d10' },
          duration: 5000,
        })
        // Still continue to save mapping
      }
    }

    // Step 2: Save column mapping (this is required)
    try {
      await saveMapping({ workbook_id: workbook.id, mapping: fullMapping })
      toast.success('Mapping saved! Proceeding to validation…')
      onComplete({ mapping: fullMapping })
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || 'Unknown error'
      toast.error('Failed to save mapping: ' + detail)
      console.error('saveMapping error:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleCellChange = (rowIdx, col, newValue) => {
    setEditedPreview(prev => {
      const updated = [...prev]
      updated[rowIdx] = { ...updated[rowIdx], [col]: newValue }
      return updated
    })
  }

  // Smart AI fix using full row context
  const handleAiFix = async (rowIdx, col, value, errorMsg) => {
    const fullRow = (editedPreview.length > 0 ? editedPreview : preview)[rowIdx] || {}
    const targetKey = mapping[col]
    const field = schema.find(f => f.key === targetKey)
    const fieldType = field ? field.type : 'string'

    // Smart local fix using row context
    let fixed = value
    if (fieldType === 'email') {
      const nameVal = Object.entries(fullRow).find(([k]) =>
        k.toLowerCase().includes('name') || k.toLowerCase().includes('first')
      )?.[1] || ''
      const companyVal = Object.entries(fullRow).find(([k]) =>
        k.toLowerCase().includes('company') || k.toLowerCase().includes('firm')
      )?.[1] || ''

      if (value.includes('@')) {
        const localPart = value.split('@')[0]
        const domain = companyVal
          ? companyVal.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
          : 'example.com'
        fixed = localPart + '@' + domain
      } else if (nameVal) {
        const parts = nameVal.toLowerCase().trim().split(/\s+/)
        const local = parts.length > 1 ? parts[0] + '.' + parts[parts.length - 1] : parts[0]
        const domain = companyVal
          ? companyVal.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
          : 'example.com'
        fixed = local + '@' + domain
      } else {
        fixed = 'user@example.com'
      }
    } else if (fieldType === 'integer') {
      fixed = value.replace(/[^0-9]/g, '') || '0'
    } else if (fieldType === 'float') {
      fixed = value.replace(/[^0-9.]/g, '') || '0'
    } else if (fieldType === 'phone') {
      fixed = value.replace(/[^0-9+\-() ]/g, '').trim()
    }

    handleCellChange(rowIdx, col, fixed)
    toast.success('Fixed: "' + value + '" → "' + fixed + '"')
  }

  const requiredFields = schema.filter(f => f.required).map(f => f.key)
  const mappedTargets = Object.values(mapping).filter(Boolean)
  const missingRequired = requiredFields.filter(f => !mappedTargets.includes(f))

  const mappedCount = Object.values(mapping).filter(Boolean).length
  const unmappedCols = headers.filter(col => !mapping[col])
  const keptUnmappedCols = unmappedCols.filter(col => customNames[col])
  const skippedCount = unmappedCols.length - keptUnmappedCols.length

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl text-white mb-1">Map Columns</h2>
          <p className="text-sm" style={{ color: '#6b6b8a' }}>
            Match source columns to the target schema. Unmapped columns keep their original name by default.
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: '#0d2e19', color: '#4ade80' }}>
              ✓ {mappedCount} mapped to schema
            </span>
            {keptUnmappedCols.length > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: '#1a1408', color: '#fbbf24' }}>
                ✎ {keptUnmappedCols.length} kept with custom name
              </span>
            )}
            {skippedCount > 0 && (
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                style={{ background: '#13131a', color: '#6b6b8a' }}>
                — {skippedCount} skipped
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAiMap}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e' }}>
            {aiLoading
              ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 spin"
                    style={{ borderColor: '#3d2f6e', borderTopColor: '#a78bfa' }} />
                  Mapping...
                </>
              )
              : (
                <>
                  <Zap size={14} /> AI Auto-Map
                </>
              )}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (mappedCount === 0 && keptUnmappedCols.length === 0)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: '#6c63ff', color: '#fff' }}>
            <Save size={14} />
            {saving ? 'Saving...' : 'Save & Continue →'}
          </button>
        </div>
      </div>

      {/* Missing required fields warning */}
      {missingRequired.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg flex items-start gap-3"
          style={{ background: '#1a0808', border: '1px solid #3f1515' }}>
          <AlertCircle size={15} style={{ color: '#f87171', marginTop: 1, flexShrink: 0 }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#f87171' }}>Required fields not mapped</p>
            <p className="text-xs mt-0.5" style={{ color: '#c87171' }}>
              {missingRequired.map(f => {
                const found = schema.find(s => s.key === f)
                return found ? found.label : f
              }).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* AI suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg" style={{ background: '#1a1230', border: '1px solid #3d2f6e' }}>
          <p className="text-xs font-medium mb-1" style={{ color: '#a78bfa' }}>💡 AI Suggestions</p>
          <ul className="space-y-1">
            {suggestions.map((s, i) => (
              <li key={i} className="text-xs" style={{ color: '#8b7fd4' }}>• {s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit"
        style={{ background: '#0d0d14', border: '1px solid #1e1e2e' }}>
        {[
          { key: 'mapping', label: '⇄ Column Mapping' },
          { key: 'workbook', label: '📊 Workbook View' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
            style={tab === t.key
              ? { background: '#1a1230', color: '#a78bfa' }
              : { color: '#6b6b8a' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* MAPPING TAB */}
      {tab === 'mapping' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e2e' }}>
          {/* Column headers */}
          <div className="grid px-5 py-2.5"
            style={{
              gridTemplateColumns: '1fr 36px 1fr 1fr 80px',
              background: '#0d0d14',
              borderBottom: '1px solid #1e1e2e'
            }}>
            {['Source Column', '', 'Map to Schema Field', 'Custom Name (if unmapped)', 'AI Conf.'].map((h, i) => (
              <div key={i} className="text-xs font-mono uppercase"
                style={{ color: '#6b6b8a', letterSpacing: '0.5px' }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows — mapped first then unmapped */}
          {[
            ...headers.filter(c => mapping[c]),
            ...headers.filter(c => !mapping[c]),
          ].map(col => {
            const conf = confidence[col]
            const mapped = mapping[col]
            const targetField = schema.find(f => f.key === mapped)
            const isRequired = targetField ? targetField.required : false
            const customName = customNames[col] !== undefined ? customNames[col] : col
            const isKept = !mapped && customName

            return (
              <div
                key={col}
                className="grid items-center px-5 py-3 transition-colors"
                style={{
                  gridTemplateColumns: '1fr 36px 1fr 1fr 80px',
                  borderBottom: '1px solid #0f0f18',
                  background: mapped ? 'transparent' : isKept ? '#0d1208' : '#0a0a0e',
                }}>

                {/* Source column pill */}
                <div className="flex items-center gap-2">
                  <div
                    className="font-mono text-xs px-2.5 py-1.5 rounded-lg truncate"
                    style={{
                      maxWidth: 160,
                      background: '#13131a',
                      color: mapped ? '#a78bfa' : isKept ? '#86efac' : '#6b6b8a',
                      border: '1px solid ' + (mapped ? '#3d2f6e' : isKept ? '#1f4027' : '#1e1e2e'),
                    }}>
                    {col}
                  </div>
                  {isRequired && mapped && (
                    <CheckCircle2 size={13} style={{ color: '#4ade80', flexShrink: 0 }} />
                  )}
                </div>

                {/* Arrow indicator */}
                <div className="text-center text-base"
                  style={{ color: mapped ? '#6c63ff' : isKept ? '#4ade80' : '#1e1e2e' }}>
                  {mapped ? '→' : isKept ? '✎' : '—'}
                </div>

                {/* Schema field dropdown */}
                <select
                  value={mapping[col] || ''}
                  onChange={e => {
                    const val = e.target.value || null
                    setMapping(m => ({ ...m, [col]: val }))
                    if (val) {
                      setCustomNames(n => {
                        const copy = { ...n }
                        delete copy[col]
                        return copy
                      })
                    } else {
                      setCustomNames(n => ({ ...n, [col]: col }))
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none cursor-pointer mr-2"
                  style={{
                    background: '#0d0d14',
                    border: '1px solid ' + (mapped ? '#3d2f6e' : '#1e1e2e'),
                    color: mapped ? '#e8e6f0' : '#4b4b6b',
                  }}>
                  <option value="">— skip / use custom name →</option>
                  {schema.map(f => (
                    <option
                      key={f.key}
                      value={f.key}
                      disabled={mappedTargets.includes(f.key) && mapping[col] !== f.key}>
                      {f.label}{f.required ? ' *' : ''} ({f.type})
                    </option>
                  ))}
                </select>

                {/* Custom name input — only shown when not mapped to schema */}
                {!mapped ? (
                  <div className="relative ml-1">
                    <PenLine size={11}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: '#6b6b8a' }} />
                    <input
                      value={customName}
                      onChange={e => setCustomNames(n => ({ ...n, [col]: e.target.value }))}
                      placeholder="Column name..."
                      className="w-full pl-7 pr-3 py-2 rounded-lg text-xs outline-none"
                      style={{
                        background: customName ? '#0d1208' : '#0d0d14',
                        border: '1px solid ' + (customName ? '#1f4027' : '#1e1e2e'),
                        color: customName ? '#86efac' : '#4b4b6b',
                        fontFamily: 'DM Mono, monospace',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="ml-1 text-xs px-3 py-2 rounded-lg font-mono"
                    style={{ background: '#13131a', color: '#3a3a5a', border: '1px solid #0f0f18' }}>
                    —
                  </div>
                )}

                {/* AI confidence badge */}
                <div className="text-center">
                  {conf != null ? (
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded"
                      style={{
                        background: conf > 0.8 ? '#0d2e19' : conf > 0.5 ? '#1a1408' : '#1a0808',
                        color: conf > 0.8 ? '#4ade80' : conf > 0.5 ? '#fbbf24' : '#f87171',
                      }}>
                      {Math.round(conf * 100)}%
                    </span>
                  ) : (
                    <span className="text-xs font-mono" style={{ color: '#2a2a3a' }}>—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* WORKBOOK TAB */}
      {tab === 'workbook' && (
        <WorkbookGrid
          rows={editedPreview.length > 0 ? editedPreview : preview}
          headers={headers}
          mapping={mapping}
          schema={schema}
          validationErrors={{}}
          onCellChange={handleCellChange}
          onAiFix={handleAiFix}
        />
      )}
    </div>
  )
}