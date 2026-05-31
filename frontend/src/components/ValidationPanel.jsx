import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play, Lightbulb, ChevronDown, ChevronUp,
  List, BarChart3, Replace, Search,
  CheckCircle, Zap, RefreshCw, Shield
} from 'lucide-react'
import toast from 'react-hot-toast'
import { runValidation, getInsights, getPreview } from '../utils/api'
import WorkbookGrid from './WorkbookGrid'

// ─────────────────────────────────────────────────────────────────────────────
// Tiny helpers
// ─────────────────────────────────────────────────────────────────────────────
function MiniBar({ pct, color }) {
  return (
    <div style={{ height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: Math.min(pct, 100) + '%', background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
    </div>
  )
}

function QualityRing({ score }) {
  const r = 38, circ = 2 * Math.PI * r
  const color = score >= 80 ? '#4ade80' : score >= 50 ? '#fbbf24' : '#f87171'
  const label = score >= 80 ? 'Good'    : score >= 50 ? 'Fair'    : 'Poor'
  return (
    <div style={{ position: 'relative', width: 104, height: 104 }}>
      <svg width="104" height="104" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="52" cy="52" r={r} fill="none" stroke="#1e1e2e" strokeWidth="7" />
        <circle cx="52" cy="52" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={circ - (score / 100) * circ}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color, fontFamily: 'Syne,sans-serif', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 9, color: '#6b6b8a', fontFamily: 'DM Mono,monospace' }}>{label}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step definitions
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { icon: '📂', text: 'Loading dataset into memory' },
  { icon: '⇄',  text: 'Applying column mapping' },
  { icon: '📌', text: 'Checking required fields' },
  { icon: '✉',  text: 'Validating email & phone formats' },
  { icon: '🔢', text: 'Running numeric type checks' },
  { icon: '📋', text: 'Checking enum & status values' },
  { icon: '🔍', text: 'Scanning for duplicate rows' },
  { icon: '📊', text: 'Building quality report' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Running animation screen
// ─────────────────────────────────────────────────────────────────────────────
function RunningScreen({ stepIndex, rowCount }) {
  return (
    <div style={{ padding: '48px 0', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{
          width: 72, height: 72, margin: '0 auto 20px',
          background: 'linear-gradient(135deg,#1a1230,#1e1640)',
          borderRadius: 20, border: '1px solid #3d2f6e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={32} style={{ color: '#a78bfa' }} />
        </div>
        <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
          Validating Your Data
        </h2>
        <p style={{ color: '#6b6b8a', fontSize: 13, margin: 0 }}>
          Running {STEPS.length} checks across {rowCount} rows…
        </p>
      </div>

      <div style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 16, overflow: 'hidden' }}>
        {STEPS.map((step, i) => {
          const done   = i < stepIndex
          const active = i === stepIndex
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
              borderBottom: i < STEPS.length - 1 ? '1px solid #0f0f18' : 'none',
              background: active ? 'rgba(108,99,255,0.06)' : 'transparent',
              transition: 'background 0.3s',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#0d2e19' : active ? '#1a1230' : '#13131a',
                border: '1px solid ' + (done ? '#1f4027' : active ? '#3d2f6e' : '#1e1e2e'),
                transition: 'all 0.4s',
              }}>
                {done   && <span style={{ color: '#4ade80', fontSize: 13 }}>✓</span>}
                {active && <div style={{ width: 12, height: 12, border: '2px solid #3d2f6e', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {!done && !active && <span style={{ color: '#2a2a3a', fontSize: 11 }}>{i + 1}</span>}
              </div>
              <span style={{ fontSize: 13, flex: 1, color: done ? '#4ade80' : active ? '#e8e6f0' : '#3a3a5a', transition: 'color 0.3s' }}>
                {step.icon}&nbsp; {step.text}
              </span>
              {done   && <CheckCircle size={14} style={{ color: '#4ade80', flexShrink: 0 }} />}
              {active && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', animation: 'pulse-dot 1s ease infinite' }} />}
            </div>
          )
        })}
      </div>

      <div style={{ height: 3, background: '#1e1e2e', borderRadius: 2, marginTop: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'linear-gradient(90deg,#6c63ff,#a78bfa)', borderRadius: 2, width: (stepIndex / STEPS.length * 100) + '%', transition: 'width 0.4s ease' }} />
      </div>
      <p style={{ textAlign: 'center', fontSize: 11, color: '#4b4b6b', margin: '8px 0 0', fontFamily: 'DM Mono,monospace' }}>
        {stepIndex} / {STEPS.length} complete
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────
export default function ValidationPanel({ workbook, schema, onComplete }) {
  // phase: 'idle' | 'running' | 'done'
  const [phase, setPhase]           = useState('idle')
  const [stepIndex, setStepIndex]   = useState(0)

  // results
  const [result, setResult]         = useState(null)
  const [qualityScore, setQuality]  = useState(null)
  const [previewHeaders, setHeaders] = useState([])
  const [editedRows, setEditedRows] = useState([])
  const [gridErrors, setGridErrors] = useState({})

  // ui state
  const [tab, setTab]               = useState('workbook')
  const [insights, setInsights]     = useState('')
  const [insightsLoading, setIL]    = useState(false)
  const [filter, setFilter]         = useState('all')
  const [expandedRow, setExpanded]  = useState(null)
  const [searchQuery, setSearch]    = useState('')
  const [showFR, setShowFR]         = useState(false)
  const [findText, setFindText]     = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [replaceCol, setReplaceCol] = useState('')

  // refs — store API result and flags WITHOUT triggering re-renders
  const apiResultRef  = useRef(null)   // stores validation API response
  const apiDoneRef    = useRef(false)  // true when API call finished
  const animDoneRef   = useRef(false)  // true when all steps animated
  const stepTimerRef  = useRef(null)

  // ── Called when BOTH animation and API are done ─────────────────────────
  const finalise = useCallback(() => {
    const data = apiResultRef.current
    if (!data) return   // shouldn't happen but guard anyway

    const total = data.total_rows || 1
    const score = Math.max(0, Math.round(100 - (data.error_rows / total) * 100 - (data.warning_rows / total) * 50))
    setQuality(score)
    setResult(data)

    // Build gridErrors  { rowIdx: { srcCol: { type, msg } } }
    const errs = {}
    ;[...(data.errors || []), ...(data.warnings || [])].forEach(item => {
      const srcCol = Object.keys(workbook.column_mapping || {}).find(
        k => workbook.column_mapping[k] === item.field
      ) || item.field
      if (!errs[item.row]) errs[item.row] = {}
      errs[item.row][srcCol] = { type: item.severity, msg: item.error }
    })
    setGridErrors(errs)

    setPhase('done')
    setTab('workbook')

    // Notify parent (stores result only, does NOT navigate away)
    onComplete(data)

    // Show result toast
    if (data.error_rows === 0 && data.warning_rows === 0) {
      toast.success('✓ All ' + data.total_rows + ' rows are valid — no errors found!')
    } else {
      toast(
        data.error_rows + ' error rows · ' + data.warning_rows + ' warnings — review below',
        { icon: '⚠', style: { background: '#1a1408', color: '#fbbf24', border: '1px solid #3f2d10' } }
      )
    }
  }, [workbook, onComplete])

  // ── Advance step animation every 350ms ─────────────────────────────────
  useEffect(() => {
    if (phase !== 'running') return
    if (stepIndex >= STEPS.length) {
      // Animation done
      animDoneRef.current = true
      if (apiDoneRef.current) finalise()   // API already done → finalise now
      return
    }
    stepTimerRef.current = setTimeout(() => {
      setStepIndex(prev => prev + 1)
    }, 350)
    return () => clearTimeout(stepTimerRef.current)
  }, [phase, stepIndex, finalise])

  // ── Main run handler ────────────────────────────────────────────────────
  const handleRun = async () => {
    // Reset all refs and state
    clearTimeout(stepTimerRef.current)
    apiResultRef.current = null
    apiDoneRef.current   = false
    animDoneRef.current  = false

    setResult(null)
    setGridErrors({})
    setQuality(null)
    setEditedRows([])
    setHeaders([])
    setStepIndex(0)
    setPhase('running')   // triggers step animation via useEffect

    try {
      const [{ data: p }, { data: v }] = await Promise.all([
        getPreview(workbook.id, { page: 1, page_size: 500 }),
        runValidation({ workbook_id: workbook.id }),
      ])

      setHeaders(p.headers || [])
      setEditedRows([...(p.rows || [])])

      // Store result and mark API done
      apiResultRef.current = v
      apiDoneRef.current   = true

      // If animation already finished, finalise immediately
      if (animDoneRef.current) finalise()
      // Otherwise the animation useEffect will call finalise() when it finishes

    } catch (e) {
      clearTimeout(stepTimerRef.current)
      toast.error(e?.response?.data?.detail || 'Validation failed — check console')
      console.error(e)
      setPhase('idle')
    }
  }

  // ── Cell editing ────────────────────────────────────────────────────────
  const handleCellChange = (rowIdx, col, newValue) => {
    setEditedRows(prev => {
      const updated = [...prev]
      updated[rowIdx] = { ...updated[rowIdx], [col]: newValue }
      return updated
    })
  }

  const handleAiFix = async (rowIdx, col, value, errorMsg) => {
    const targetKey = (workbook.column_mapping || {})[col]
    const field = schema.find(f => f.key === targetKey)
    const fieldType = field ? field.type : 'string'
    const fieldLabel = field ? field.label : col

    // Get the full row so AI has all context (name, company, etc.)
    const fullRow = editedRows[rowIdx] || {}

    // Build a context string showing all other columns in this row
    const rowContext = Object.entries(fullRow)
      .filter(([k, v]) => k !== col && v && String(v).trim())
      .map(([k, v]) => k + ': "' + v + '"')
      .join(', ')

    toast('AI is fixing this cell…', { icon: '⚡', duration: 8000 })

    try {
      const prompt = [
        'Fix this data cell value so it passes validation.',
        '',
        'Field: "' + fieldLabel + '" (type: ' + fieldType + ')',
        'Current bad value: "' + value + '"',
        'Validation error: "' + errorMsg + '"',
        '',
        'Other values in the same row (use as context):',
        rowContext || '(no other data)',
        '',
        'Instructions:',
        '- For email: construct a realistic email using the person name and company from the row. If name is "Charlie Brown" and company is "Acme", use charlie.brown@acme.com',
        '- If email looks like "charlie@invalid" fix the domain using company name if available',
        '- For phone: clean and format properly',
        '- For integer/float: extract the numeric value',
        '- For required empty fields: suggest a sensible placeholder based on other row data',
        '- Return ONLY the corrected value as plain text. No explanation, no quotes, no extra text.',
      ].join('\n')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        })
      })

      if (res.ok) {
        const data = await res.json()
        const fixed = (data.content?.[0]?.text || '').trim()
        if (fixed && fixed !== value) {
          handleCellChange(rowIdx, col, fixed)
          toast.dismiss()
          toast.success('AI fixed: "' + value + '" → "' + fixed + '"')
          return
        }
      }
    } catch (e) {
      console.log('AI fix API failed, falling back to smart local fix:', e)
    }

    // Smart local fallback using row context
    let fixed = value
    if (fieldType === 'email') {
      // Try to construct email from name + company in same row
      const nameVal = Object.entries(fullRow).find(([k]) =>
        k.toLowerCase().includes('name') || k.toLowerCase().includes('first')
      )?.[1] || ''
      const companyVal = Object.entries(fullRow).find(([k]) =>
        k.toLowerCase().includes('company') || k.toLowerCase().includes('firm') || k.toLowerCase().includes('org')
      )?.[1] || ''

      if (value.includes('@')) {
        // Has @ but bad domain — fix domain
        const localPart = value.split('@')[0]
        const domain = companyVal
          ? companyVal.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
          : 'example.com'
        fixed = localPart + '@' + domain
      } else if (nameVal) {
        // No @ — build from name
        const nameParts = nameVal.toLowerCase().trim().split(/\s+/)
        const localPart = nameParts.length > 1
          ? nameParts[0] + '.' + nameParts[nameParts.length - 1]
          : nameParts[0]
        const domain = companyVal
          ? companyVal.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
          : 'example.com'
        fixed = localPart + '@' + domain
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

    toast.dismiss()
    handleCellChange(rowIdx, col, fixed)
    toast.success('Fixed: "' + value + '" → "' + fixed + '"')
  }

  // ── Find & Replace ──────────────────────────────────────────────────────
  const handleFindReplace = () => {
    if (!findText || !replaceCol) return toast.error('Select a column and enter search text')
    let count = 0
    setEditedRows(prev => prev.map(row => {
      const cell = row[replaceCol] != null ? String(row[replaceCol]) : ''
      if (cell.includes(findText)) { count++; return { ...row, [replaceCol]: cell.split(findText).join(replaceText) } }
      return row
    }))
    toast.success('Replaced ' + count + ' cells in "' + replaceCol + '"')
    setShowFR(false); setFindText(''); setReplaceText('')
  }

  // ── AI insights ─────────────────────────────────────────────────────────
  const handleInsights = async () => {
    setIL(true); setTab('insights')
    try {
      const { data } = await getInsights(workbook.id)
      setInsights(data.insights)
    } catch { toast.error('Failed to get insights') }
    finally { setIL(false) }
  }

  // ── Build issue rows ────────────────────────────────────────────────────
  const buildRowView = () => {
    if (!result) return []
    const map = {}
    const add = (items, key) => (items || []).forEach(item => {
      if (!map[item.row]) map[item.row] = { row: item.row, errors: [], warnings: [] }
      map[item.row][key].push(item)
    })
    add(result.errors, 'errors'); add(result.warnings, 'warnings')
    return Object.values(map).sort((a, b) => a.row - b.row)
  }

  const allRows = buildRowView()
  const filteredRows = (() => {
    let r = filter === 'errors'   ? allRows.filter(x => x.errors.length > 0)
          : filter === 'warnings' ? allRows.filter(x => x.errors.length === 0 && x.warnings.length > 0)
          : allRows
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      r = r.filter(row => [...row.errors, ...row.warnings].some(e =>
        (e.field + e.error + e.value).toLowerCase().includes(q)
      ))
    }
    return r
  })()

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: RUNNING
  // ════════════════════════════════════════════════════════════════════════
  if (phase === 'running') {
    return <RunningScreen stepIndex={stepIndex} rowCount={workbook.row_count || 0} />
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: IDLE
  // ════════════════════════════════════════════════════════════════════════
  if (phase === 'idle') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Validate Data</h2>
            <p style={{ color: '#6b6b8a', fontSize: 13, margin: 0 }}>
              {STEPS.length} automated checks across all {workbook.row_count} rows. Errors highlighted directly in your spreadsheet.
            </p>
          </div>
          <button onClick={handleRun} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#6c63ff,#8b5cf6)', color: '#fff', boxShadow: '0 4px 24px rgba(108,99,255,0.4)', fontFamily: 'DM Sans,sans-serif' }}>
            <Play size={16} /> Run Validation
          </button>
        </div>

        <div style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 16, padding: '20px 22px', marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 14px' }}>Checks that will run</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
            {[
              { icon: '📌', label: 'Required fields',  desc: 'Flags empty required columns' },
              { icon: '✉',  label: 'Email format',     desc: 'Validates email address structure' },
              { icon: '📞', label: 'Phone format',     desc: 'Checks phone number patterns' },
              { icon: '🔢', label: 'Numeric types',    desc: 'Ensures numbers are actually numeric' },
              { icon: '📋', label: 'Enum values',      desc: 'Validates against allowed value lists' },
              { icon: '📅', label: 'Date formats',     desc: 'Checks date field consistency' },
              { icon: '🔍', label: 'Duplicates',       desc: 'Detects fully duplicate rows' },
              { icon: '🌍', label: 'Custom rules',     desc: 'Regex and length checks' },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#13131a', border: '1px solid #1e1e2e' }}>
                <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>{c.icon}</span>
                <div>
                  <div style={{ fontSize: 12, color: '#e8e6f0', fontWeight: 500 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: '#6b6b8a', marginTop: 2 }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Zap size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#6b6b8a', margin: 0 }}>
            After validation you get a <span style={{ color: '#a78bfa' }}>Data Quality Score</span>, per-column stats, Find &amp; Replace, and <span style={{ color: '#a78bfa' }}>AI Insights</span>.
          </p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER: DONE
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Validation Results</h2>
          <p style={{ color: '#6b6b8a', fontSize: 13, margin: 0 }}>
            {result.total_rows} rows · {result.total_errors} errors · {result.total_warnings} warnings
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowFR(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e', fontFamily: 'DM Sans,sans-serif' }}>
            <Replace size={12} /> Find &amp; Replace
          </button>
          <button onClick={handleInsights} disabled={insightsLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e', fontFamily: 'DM Sans,sans-serif' }}>
            {insightsLoading ? <div style={{ width: 12, height: 12, border: '2px solid #3d2f6e', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : <Lightbulb size={12} />}
            AI Analyze
          </button>
          <button onClick={handleRun} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: '#6c63ff', color: '#fff', border: 'none', fontFamily: 'DM Sans,sans-serif' }}>
            <RefreshCw size={12} /> Re-run
          </button>
        </div>
      </div>

      {/* Score + stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 16, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 156 }}>
          <p style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Quality Score</p>
          <QualityRing score={qualityScore || 0} />
          <p style={{ fontSize: 10, color: '#4b4b6b', fontFamily: 'DM Mono,monospace', margin: 0 }}>{result.valid_rows} / {result.total_rows} valid</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {[
            { label: 'Total Rows', value: result.total_rows,   color: '#e8e6f0', bg: '#0d0d14', border: '#1e1e2e' },
            { label: 'Valid Rows', value: result.valid_rows,   color: '#4ade80', bg: '#0d2e19', border: '#1f4027' },
            { label: 'Error Rows', value: result.error_rows,   color: '#f87171', bg: '#1a0808', border: '#3f1515' },
            { label: 'Warnings',   value: result.warning_rows, color: '#fbbf24', bg: '#1a1408', border: '#3f2d10' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: 'Syne,sans-serif', lineHeight: 1 }}>{s.value}</div>
              <div style={{ height: 2, background: 'rgba(0,0,0,0.3)', borderRadius: 1, marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: s.color, opacity: 0.4, width: (s.value / (result.total_rows || 1) * 100) + '%', transition: 'width 1s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Find & Replace */}
      {showFR && (
        <div style={{ background: '#0d0d14', border: '1px solid #3d2f6e', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: '#a78bfa', margin: '0 0 12px' }}>🔍 Find &amp; Replace</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
            <input value={findText} onChange={e => setFindText(e.target.value)} placeholder="Find text…" style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', color: '#e8e6f0', fontSize: 12, outline: 'none', fontFamily: 'DM Sans,sans-serif' }} />
            <input value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace with…" style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', color: '#e8e6f0', fontSize: 12, outline: 'none', fontFamily: 'DM Sans,sans-serif' }} />
            <select value={replaceCol} onChange={e => setReplaceCol(e.target.value)} style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', color: replaceCol ? '#e8e6f0' : '#4b4b6b', fontSize: 12, outline: 'none', fontFamily: 'DM Sans,sans-serif' }}>
              <option value="">Select column…</option>
              {previewHeaders.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <button onClick={handleFindReplace} style={{ background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans,sans-serif', fontWeight: 600 }}>Replace All</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 18, padding: 4, borderRadius: 10, background: '#0d0d14', border: '1px solid #1e1e2e', width: 'fit-content' }}>
        {[
          { key: 'workbook', label: '📊 Workbook'  },
          { key: 'issues',   label: 'Issues (' + allRows.length + ')' },
          { key: 'columns',  label: '📈 Column Stats' },
          { key: 'insights', label: '⚡ AI Insights' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', fontFamily: 'DM Sans,sans-serif', transition: 'all 0.15s', background: tab === t.key ? '#1a1230' : 'transparent', color: tab === t.key ? '#a78bfa' : '#6b6b8a' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── WORKBOOK TAB ── */}
      {tab === 'workbook' && (
        <div>
          <WorkbookGrid
            rows={editedRows}
            headers={previewHeaders}
            mapping={workbook.column_mapping || {}}
            schema={schema}
            validationErrors={gridErrors}
            showValidationOverlay={true}
            onCellChange={handleCellChange}
            onAiFix={handleAiFix}
          />
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#6b6b8a' }}>💡 Click any cell to edit inline. After fixing, re-run to refresh highlights.</span>
            <button onClick={handleRun} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>Re-run Validation</button>
          </div>
        </div>
      )}

      {/* ── ISSUES TAB ── */}
      {tab === 'issues' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b6b8a' }} />
              <input value={searchQuery} onChange={e => setSearch(e.target.value)} placeholder="Search errors…" style={{ width: '100%', background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 8, padding: '7px 12px 7px 30px', color: '#e8e6f0', fontSize: 12, outline: 'none', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 8, background: '#0d0d14', border: '1px solid #1e1e2e' }}>
              {[{ key: 'all', label: 'All' }, { key: 'errors', label: 'Errors' }, { key: 'warnings', label: 'Warnings' }].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none', fontFamily: 'DM Sans,sans-serif', fontWeight: 500, background: filter === f.key ? '#1a1230' : 'transparent', color: filter === f.key ? '#a78bfa' : '#6b6b8a' }}>{f.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredRows.slice(0, 100).map(row => (
              <div key={row.row} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid ' + (row.errors.length ? '#3f1515' : '#3f2d10') }}>
                <div onClick={() => setExpanded(expandedRow === row.row ? null : row.row)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', cursor: 'pointer', background: row.errors.length ? '#1a0808' : '#1a1408' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono,monospace', padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.3)', color: '#6b6b8a' }}>Row {row.row + 1}</span>
                    {row.errors.map((e, i) => <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#3f1515', color: '#f87171', fontFamily: 'DM Mono,monospace' }}>✗ {e.field}: {e.error}</span>)}
                    {row.warnings.map((w, i) => <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#3f2d10', color: '#fbbf24', fontFamily: 'DM Mono,monospace' }}>⚠ {w.field}</span>)}
                  </div>
                  {expandedRow === row.row ? <ChevronUp size={13} style={{ color: '#6b6b8a' }} /> : <ChevronDown size={13} style={{ color: '#6b6b8a' }} />}
                </div>
                {expandedRow === row.row && (
                  <div style={{ background: '#0d0d14', borderTop: '1px solid #1e1e2e', padding: '10px 14px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr>{['Field','Value','Issue','Severity'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: '#6b6b8a', fontFamily: 'DM Mono,monospace', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid #1e1e2e' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[...row.errors, ...row.warnings].map((item, i) => (
                          <tr key={i}>
                            <td style={{ padding: '5px 8px', color: '#a78bfa', fontFamily: 'DM Mono,monospace', fontSize: 11 }}>{item.field}</td>
                            <td style={{ padding: '5px 8px', color: '#6b6b8a', fontFamily: 'DM Mono,monospace', fontSize: 11 }}>"{item.value}"</td>
                            <td style={{ padding: '5px 8px', color: '#c8c6d8', fontSize: 11 }}>{item.error}</td>
                            <td style={{ padding: '5px 8px' }}><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontFamily: 'DM Mono,monospace', background: item.severity === 'error' ? '#3f1515' : '#3f2d10', color: item.severity === 'error' ? '#f87171' : '#fbbf24' }}>{item.severity}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {filteredRows.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: '#6b6b8a' }}>
                <CheckCircle size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontSize: 14, margin: 0 }}>No issues in this category</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COLUMN STATS TAB ── */}
      {tab === 'columns' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {Object.entries(result.column_stats || {}).map(([col, stat]) => {
            const total   = result.total_rows || 1
            const fillPct = Math.round((1 - stat.null_count / total) * 100)
            const errPct  = Math.round((stat.error_count   / total) * 100)
            return (
              <div key={col} style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono,monospace', color: '#a78bfa', fontWeight: 600 }}>{col}</span>
                  {stat.error_count > 0
                    ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#3f1515', color: '#f87171' }}>{stat.error_count} errors</span>
                    : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#0d2e19', color: '#4ade80' }}>✓ clean</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#6b6b8a', width: 46, flexShrink: 0 }}>Fill</span>
                    <MiniBar pct={fillPct} color={fillPct > 80 ? '#4ade80' : '#fbbf24'} />
                    <span style={{ fontSize: 10, color: '#c8c6d8', fontFamily: 'DM Mono,monospace', width: 36, textAlign: 'right' }}>{fillPct}%</span>
                  </div>
                  {stat.error_count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#6b6b8a', width: 46, flexShrink: 0 }}>Errors</span>
                      <MiniBar pct={errPct} color='#ef4444' />
                      <span style={{ fontSize: 10, color: '#f87171', fontFamily: 'DM Mono,monospace', width: 36, textAlign: 'right' }}>{errPct}%</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: '#6b6b8a', fontFamily: 'DM Mono,monospace' }}>{stat.unique_count} unique</span>
                    <span style={{ fontSize: 10, color: '#6b6b8a', fontFamily: 'DM Mono,monospace' }}>{stat.null_count} empty</span>
                  </div>
                  {stat.top_values && Object.keys(stat.top_values).length > 0 && (
                    <div style={{ borderTop: '1px solid #0f0f18', paddingTop: 8, marginTop: 2 }}>
                      <p style={{ fontSize: 9, fontFamily: 'DM Mono,monospace', color: '#4b4b6b', textTransform: 'uppercase', margin: '0 0 6px' }}>Top values</p>
                      {Object.entries(stat.top_values).slice(0, 4).map(([val, cnt]) => (
                        <div key={val} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: '#8b8ba0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{val}</span>
                          <span style={{ fontSize: 10, color: '#4b4b6b', fontFamily: 'DM Mono,monospace', flexShrink: 0 }}>{cnt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── AI INSIGHTS TAB ── */}
      {tab === 'insights' && (
        <div>
          {insightsLoading && (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ width: 40, height: 40, border: '3px solid #3d2f6e', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ color: '#6b6b8a', fontSize: 13 }}>Analyzing your data quality…</p>
            </div>
          )}
          {!insightsLoading && insights && (
            <div style={{ background: '#0d0d14', border: '1px solid #3d2f6e', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#1a1230', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={16} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa', margin: 0 }}>AI Data Analysis</p>
                  <p style={{ fontSize: 11, color: '#6b6b8a', margin: 0 }}>Generated from your validation results</p>
                </div>
              </div>
              <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: '#c8c6d8', fontFamily: 'DM Sans,sans-serif', lineHeight: 1.7, margin: 0 }}>{insights}</pre>
            </div>
          )}
          {!insightsLoading && !insights && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: '#1a1230', border: '1px solid #3d2f6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Lightbulb size={24} style={{ color: '#a78bfa' }} />
              </div>
              <p style={{ color: '#e8e6f0', fontWeight: 600, margin: '0 0 8px' }}>No insights yet</p>
              <p style={{ color: '#6b6b8a', fontSize: 13, margin: '0 0 20px' }}>Click "AI Analyze" above to get AI-powered recommendations.</p>
              <button onClick={handleInsights} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans,sans-serif' }}>
                <Lightbulb size={14} /> Generate AI Insights
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}