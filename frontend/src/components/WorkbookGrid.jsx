import { useState, useMemo, useRef, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Wand2, Pencil, Check, X } from 'lucide-react'

/**
 * WorkbookGrid — Flatfile-style spreadsheet with:
 * - Red/amber cell highlighting for errors/warnings
 * - Click-to-edit any cell inline
 * - AI Fix button on error cells (calls parent handler)
 * - Hover tooltip showing the error message
 */
export default function WorkbookGrid({
  rows = [],
  headers = [],
  mapping = {},
  schema = [],
  validationErrors = {},   // { rowIdx: { col: { type, msg } } }
  onCellChange,            // (rowIdx, col, newValue) => void
  onAiFix,                 // (rowIdx, col, value, errorMsg) => void
  showValidationOverlay = false,
}) {
  const [editingCell, setEditingCell] = useState(null) // { row, col }
  const [editValue, setEditValue] = useState('')
  const [hoveredCell, setHoveredCell] = useState(null)
  const [fixingCell, setFixingCell] = useState(null)   // { row, col }
  const [page, setPage] = useState(0)
  const inputRef = useRef()
  const PAGE_SIZE = 50

  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus()
  }, [editingCell])

  // Reverse map: sourceCol → schemaField key
  const reverseMap = useMemo(() => {
    const m = {}
    Object.entries(mapping).forEach(([src, target]) => { if (target) m[src] = target })
    return m
  }, [mapping])

  // Client-side validation per cell
  const getCellStatus = (col, value) => {
    const targetKey = reverseMap[col]
    if (!targetKey) return null
    const field = schema.find(f => f.key === targetKey)
    if (!field) return null
    const v = String(value ?? '').trim()
    if (field.required && v === '') return { type: 'error', msg: `${field.label} is required` }
    if (v === '') return null
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      return { type: 'error', msg: 'Invalid email format' }
    if (field.type === 'integer' && isNaN(parseInt(v)))
      return { type: 'error', msg: 'Must be a whole number' }
    if (field.type === 'float' && isNaN(parseFloat(v)))
      return { type: 'error', msg: 'Must be a number' }
    if (field.type === 'phone' && !/^\+?[\d\s\-(). ]{7,20}$/.test(v))
      return { type: 'warning', msg: 'Unusual phone format' }
    if (field.type === 'enum' && field.enum_values?.length)
      if (!field.enum_values.map(e => e.toLowerCase()).includes(v.toLowerCase()))
        return { type: 'warning', msg: `Expected: ${field.enum_values.join(', ')}` }
    return null
  }

  // Merge client validation with backend validation result overlay
  const getCellInfo = (col, value, rowIdx) => {
    // Backend validation takes priority (shown after "Run Validation")
    if (showValidationOverlay && validationErrors[rowIdx]?.[col]) {
      return validationErrors[rowIdx][col]
    }
    return getCellStatus(col, value)
  }

  // Aggregate stats
  const { rowErrors, colErrors, totalErrors, totalWarnings } = useMemo(() => {
    const rowErrors = {}, colErrors = {}
    let totalErrors = 0, totalWarnings = 0
    rows.forEach((row, ri) => {
      headers.forEach(col => {
        const s = getCellInfo(col, row[col], ri)
        if (!s) return
        if (!rowErrors[ri]) rowErrors[ri] = []
        rowErrors[ri].push({ col, ...s })
        colErrors[col] = (colErrors[col] || 0) + 1
        s.type === 'error' ? totalErrors++ : totalWarnings++
      })
    })
    return { rowErrors, colErrors, totalErrors, totalWarnings }
  }, [rows, headers, mapping, schema, validationErrors])

  const startEdit = (rowIdx, col, currentValue) => {
    setEditingCell({ row: rowIdx, col })
    setEditValue(currentValue ?? '')
    setHoveredCell(null)
  }

  const commitEdit = (rowIdx, col) => {
    if (onCellChange) onCellChange(rowIdx, col, editValue)
    setEditingCell(null)
  }

  const cancelEdit = () => setEditingCell(null)

  const handleKeyDown = (e, rowIdx, col) => {
    if (e.key === 'Enter') commitEdit(rowIdx, col)
    if (e.key === 'Escape') cancelEdit()
    if (e.key === 'Tab') { e.preventDefault(); commitEdit(rowIdx, col) }
  }

  const handleAiFixClick = async (e, rowIdx, col, value, errorMsg) => {
    e.stopPropagation()
    if (!onAiFix) return
    setFixingCell({ row: rowIdx, col })
    try {
      await onAiFix(rowIdx, col, value, errorMsg)
    } finally {
      setFixingCell(null)
    }
  }

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(rows.length / PAGE_SIZE)

  return (
    <div>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono" style={{ color: '#6b6b8a' }}>
            {rows.length} rows · {headers.length} columns
          </span>
          {totalErrors > 0 && (
            <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: '#1a0808', color: '#f87171', border: '1px solid #3f1515' }}>
              <AlertCircle size={10} /> {totalErrors} errors
            </span>
          )}
          {totalWarnings > 0 && (
            <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: '#1a1408', color: '#fbbf24', border: '1px solid #3f2d10' }}>
              ⚠ {totalWarnings} warnings
            </span>
          )}
          {totalErrors === 0 && totalWarnings === 0 && rows.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: '#0d2e19', color: '#4ade80', border: '1px solid #1f4027' }}>
              <CheckCircle2 size={10} /> All cells valid
            </span>
          )}
          {onCellChange && (
            <span className="text-xs" style={{ color: '#4b4b6b' }}>
              · Click any cell to edit
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: '#6b6b8a' }}>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#1a0808', border: '1px solid #3f1515' }} /> Error
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#1a1408', border: '1px solid #3f2d10' }} /> Warning
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'rgba(108,99,255,0.08)', border: '1px solid #3d2f6e' }} /> Mapped
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e2e', maxHeight: '540px', overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              {/* Row # */}
              <th style={{
                width: 44, padding: '8px 8px', textAlign: 'center',
                background: '#0a0a0f', borderBottom: '1px solid #1e1e2e',
                borderRight: '1px solid #1e1e2e', color: '#3a3a5a',
                fontFamily: 'DM Mono, monospace', fontSize: 10,
                position: 'sticky', left: 0, zIndex: 11,
              }}>#</th>

              {headers.map(col => {
                const targetKey = reverseMap[col]
                const field = targetKey ? schema.find(f => f.key === targetKey) : null
                const isMapped = !!targetKey
                const hasErrors = (colErrors[col] || 0) > 0
                return (
                  <th key={col} style={{
                    padding: '8px 12px', textAlign: 'left', minWidth: 130,
                    background: isMapped ? '#160f2a' : '#0d0d14',
                    borderBottom: `2px solid ${hasErrors ? '#5a1a1a' : isMapped ? '#3d2f6e' : '#1e1e2e'}`,
                    borderRight: '1px solid #1e1e2e',
                    color: isMapped ? '#a78bfa' : '#6b6b8a',
                    fontFamily: 'DM Mono, monospace', fontSize: 10,
                    fontWeight: 600, whiteSpace: 'nowrap',
                  }}>
                    <div className="flex items-center gap-1">
                      <span className="uppercase tracking-wide">{col}</span>
                      {hasErrors && <AlertCircle size={9} style={{ color: '#f87171' }} />}
                    </div>
                    {field && (
                      <div style={{ fontSize: 9, color: '#6b6b8a', fontWeight: 400, marginTop: 1 }}>
                        → {field.label}{field.required ? ' *' : ''}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row, ri) => {
              const absRowIdx = page * PAGE_SIZE + ri
              const rowHasError = rowErrors[absRowIdx]?.some(e => e.type === 'error')
              const rowHasWarn  = !rowHasError && rowErrors[absRowIdx]?.some(e => e.type === 'warning')

              return (
                <tr key={ri} style={{ background: rowHasError ? 'rgba(239,68,68,0.03)' : rowHasWarn ? 'rgba(251,191,36,0.02)' : 'transparent' }}>
                  {/* Row number */}
                  <td style={{
                    padding: '5px 8px', textAlign: 'center',
                    color: rowHasError ? '#7f4444' : '#3a3a5a',
                    fontFamily: 'DM Mono, monospace', fontSize: 10,
                    borderBottom: '1px solid #0f0f18', borderRight: '1px solid #1e1e2e',
                    background: rowHasError ? '#130808' : '#0a0a0f',
                    position: 'sticky', left: 0, zIndex: 1,
                  }}>
                    {absRowIdx + 1}
                  </td>

                  {headers.map(col => {
                    const cellInfo = getCellInfo(col, row[col], absRowIdx)
                    const isMapped = !!reverseMap[col]
                    const isEditing = editingCell?.row === absRowIdx && editingCell?.col === col
                    const isHovered = hoveredCell?.row === absRowIdx && hoveredCell?.col === col
                    const isFixing  = fixingCell?.row === absRowIdx && fixingCell?.col === col
                    const value = row[col] ?? ''
                    const isError   = cellInfo?.type === 'error'
                    const isWarning = cellInfo?.type === 'warning'

                    return (
                      <td key={col}
                        onMouseEnter={() => !isEditing && setHoveredCell({ row: absRowIdx, col })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => !isEditing && startEdit(absRowIdx, col, value)}
                        style={{
                          padding: 0,
                          borderBottom: '1px solid #0f0f18',
                          borderRight: '1px solid #0f0f18',
                          position: 'relative',
                          background: isEditing
                            ? '#12101e'
                            : isError
                            ? '#1a0808'
                            : isWarning
                            ? '#1a1408'
                            : isMapped
                            ? 'rgba(108,99,255,0.03)'
                            : 'transparent',
                          outline: isEditing
                            ? '2px solid #6c63ff'
                            : isError
                            ? '1px solid rgba(239,68,68,0.35)'
                            : isWarning
                            ? '1px solid rgba(251,191,36,0.2)'
                            : 'none',
                          cursor: 'text',
                          minWidth: 130,
                        }}>

                        {isEditing ? (
                          /* ── Edit mode ── */
                          <div className="flex items-center gap-1 px-1 py-0.5">
                            <input
                              ref={inputRef}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => handleKeyDown(e, absRowIdx, col)}
                              onBlur={() => commitEdit(absRowIdx, col)}
                              style={{
                                flex: 1, background: 'transparent', border: 'none',
                                outline: 'none', color: '#e8e6f0', fontSize: 12,
                                fontFamily: 'DM Sans, sans-serif', padding: '4px 6px',
                                minWidth: 80,
                              }}
                            />
                            <button onMouseDown={e => { e.preventDefault(); commitEdit(absRowIdx, col) }}
                              style={{ color: '#4ade80', padding: '2px', flexShrink: 0 }}>
                              <Check size={11} />
                            </button>
                            <button onMouseDown={e => { e.preventDefault(); cancelEdit() }}
                              style={{ color: '#f87171', padding: '2px', flexShrink: 0 }}>
                              <X size={11} />
                            </button>
                          </div>
                        ) : (
                          /* ── Display mode ── */
                          <div className="flex items-center justify-between group"
                            style={{ padding: '5px 10px', minHeight: 32 }}>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {/* Error dot */}
                              {cellInfo && (
                                <span style={{
                                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                                  background: isError ? '#ef4444' : '#f59e0b',
                                  display: 'inline-block',
                                }} />
                              )}
                              <span style={{
                                color: isError ? '#fca5a5' : isWarning ? '#fde68a' : value === '' ? '#2a2a3a' : '#c8c6d8',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                fontStyle: value === '' ? 'italic' : 'normal', fontSize: 12,
                              }}>
                                {value === '' ? 'empty' : value}
                              </span>
                            </div>

                            {/* Action buttons on hover — only for error/warning cells */}
                            {isHovered && cellInfo && onCellChange && (
                              <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                                {/* Edit pencil */}
                                <button
                                  onClick={e => { e.stopPropagation(); startEdit(absRowIdx, col, value) }}
                                  title="Edit cell"
                                  style={{
                                    padding: '2px 4px', borderRadius: 4, fontSize: 10,
                                    background: '#1a1a2e', color: '#a78bfa',
                                    border: '1px solid #3d2f6e', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 3,
                                  }}>
                                  <Pencil size={9} /> Edit
                                </button>
                                {/* AI fix */}
                                {onAiFix && (
                                  <button
                                    onClick={e => handleAiFixClick(e, absRowIdx, col, value, cellInfo.msg)}
                                    title="AI fix this cell"
                                    disabled={isFixing}
                                    style={{
                                      padding: '2px 4px', borderRadius: 4, fontSize: 10,
                                      background: '#0d2e19', color: '#4ade80',
                                      border: '1px solid #1f4027', cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: 3,
                                      opacity: isFixing ? 0.6 : 1,
                                    }}>
                                    {isFixing
                                      ? <div style={{ width: 9, height: 9, border: '1.5px solid #4ade80', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                      : <Wand2 size={9} />
                                    }
                                    {isFixing ? '…' : 'AI Fix'}
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Edit icon on hover for normal cells */}
                            {isHovered && !cellInfo && onCellChange && (
                              <Pencil size={10} style={{ color: '#3a3a5a', flexShrink: 0 }} />
                            )}
                          </div>
                        )}

                        {/* Error tooltip */}
                        {isHovered && cellInfo && !isEditing && (
                          <div style={{
                            position: 'absolute', bottom: '100%', left: 0, zIndex: 50,
                            background: isError ? '#2a0f0f' : '#2a1f0a',
                            border: `1px solid ${isError ? '#7f1d1d' : '#713f12'}`,
                            borderRadius: 6, padding: '5px 10px', whiteSpace: 'nowrap',
                            fontSize: 11, color: isError ? '#fca5a5' : '#fde68a',
                            fontFamily: 'DM Mono, monospace', pointerEvents: 'none',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                          }}>
                            {isError ? '✗' : '⚠'} {cellInfo.msg}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-mono" style={{ color: '#6b6b8a' }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 rounded text-xs font-medium disabled:opacity-30"
              style={{ background: '#0d0d14', color: '#a78bfa', border: '1px solid #1e1e2e' }}>
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
              <button key={i} onClick={() => setPage(i)}
                className="px-3 py-1 rounded text-xs font-medium transition-all"
                style={{
                  background: page === i ? '#6c63ff' : '#0d0d14',
                  color: page === i ? '#fff' : '#6b6b8a',
                  border: '1px solid #1e1e2e',
                }}>
                {i + 1}
              </button>
            ))}
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 rounded text-xs font-medium disabled:opacity-30"
              style={{ background: '#0d0d14', color: '#a78bfa', border: '1px solid #1e1e2e' }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="text-center py-16" style={{ color: '#6b6b8a' }}>
          <p className="text-sm">No data to display</p>
        </div>
      )}
    </div>
  )
}
