import { useState, useEffect } from 'react'
import { Wand2, Zap, Play, Check, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { createAiTransform, applyTransform, runAutofix, getTransformHistory } from '../utils/api'

const AUTOFIX_OPTIONS = [
  { key: 'whitespace', label: 'Trim Whitespace', desc: 'Remove leading/trailing spaces from all cells' },
  { key: 'email', label: 'Normalize Emails', desc: 'Lowercase and strip email fields' },
  { key: 'phone', label: 'Clean Phone Numbers', desc: 'Remove invalid characters from phone fields' },
  { key: 'case', label: 'Fix Name Casing', desc: 'Title-case all name fields' },
  { key: 'duplicates', label: 'Remove Duplicates', desc: 'Remove fully duplicate rows' },
]

export default function TransformPanel({ workbook, onRefresh }) {
  const [tab, setTab] = useState('ai')
  const [prompt, setPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [pendingTransform, setPendingTransform] = useState(null)
  const [applyingId, setApplyingId] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedFixes, setSelectedFixes] = useState([])
  const [autofixLoading, setAutofixLoading] = useState(false)
  const [autofixPreview, setAutofixPreview] = useState(null)
  const [expandedTransform, setExpandedTransform] = useState(null)

  useEffect(() => { loadHistory() }, [workbook.id])

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const { data } = await getTransformHistory(workbook.id)
      setHistory(data)
    } catch { }
    finally { setHistoryLoading(false) }
  }

  const handleAiTransform = async (previewOnly = true) => {
    if (!prompt.trim()) return toast.error('Enter a transform instruction')
    setAiLoading(true)
    try {
      const { data } = await createAiTransform({
        workbook_id: workbook.id,
        prompt: prompt.trim(),
        preview_only: previewOnly,
      })
      setPendingTransform(data)
      if (data.self_healed) {
        toast.success(`✓ Transform self-corrected after ${data.attempts} attempts — review before applying`)
      } else {
        toast.success('Transform generated! Review the preview below.')
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to generate transform')
    } finally { setAiLoading(false) }
  }

  const handleApply = async (transformId) => {
    setApplyingId(transformId)
    try {
      const { data } = await applyTransform({ transform_id: transformId })
      toast.success('Applied! ' + data.rows_affected + ' rows changed.')
      setPendingTransform(null)
      setPrompt('')
      await loadHistory()
      setTab('history')
      onRefresh()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to apply transform')
    } finally { setApplyingId(null) }
  }

  const handleAutofixPreview = async () => {
    if (!selectedFixes.length) return toast.error('Select at least one fix type')
    setAutofixLoading(true)
    try {
      const { data } = await runAutofix({ workbook_id: workbook.id, fix_types: selectedFixes, preview_only: true })
      setAutofixPreview(data)
      toast.success('Preview ready — review changes below')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Autofix preview failed')
    } finally { setAutofixLoading(false) }
  }

  const handleAutofixApply = async () => {
    setAutofixLoading(true)
    try {
      const { data } = await runAutofix({ workbook_id: workbook.id, fix_types: selectedFixes, preview_only: false })
      toast.success('AutoFix applied! ' + (data.summary?.length || 0) + ' fixes completed.')
      setAutofixPreview(null)
      setSelectedFixes([])
      // Load history and switch to history tab so user sees what was applied
      await loadHistory()
      setTab('history')
      // Update workbook data silently without changing step
      onRefresh()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Autofix failed')
    } finally { setAutofixLoading(false) }
  }

  const toggleFix = (key) => {
    setSelectedFixes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display font-bold text-2xl text-white mb-1">Transform Data</h2>
        <p className="text-sm" style={{ color: '#6b6b8a' }}>Use AI to reshape, clean and fix your data with natural language.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: '#0d0d14', border: '1px solid #1e1e2e' }}>
        {[
          { key: 'ai', label: '⚡ AI Transform' },
          { key: 'autofix', label: '🔧 AutoFix' },
          { key: 'history', label: `📋 History (${history.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-1.5 rounded-md text-xs font-medium transition-all"
            style={tab === t.key ? { background: '#1a1230', color: '#a78bfa' } : { color: '#6b6b8a' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* AI Transform tab */}
      {tab === 'ai' && (
        <div>
          <div className="rounded-xl p-5 mb-4" style={{ background: '#0d0d14', border: '1px solid #1e1e2e' }}>
            <label className="block text-xs font-mono uppercase mb-2" style={{ color: '#6b6b8a', letterSpacing: '0.5px' }}>
              Describe your transformation
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              placeholder='e.g. "Capitalize all names", "Remove rows where email is empty", "Convert age column to numbers", "Trim all phone numbers to digits only"'
              className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
              style={{ background: '#13131a', border: '1px solid #2a2a3a', color: '#e8e6f0', fontFamily: 'DM Sans, sans-serif' }}
            />
            <div className="flex items-center justify-between mt-3">
              <div className="flex gap-2 flex-wrap">
                {['Capitalize all names', 'Lowercase emails', 'Remove empty rows', 'Extract domain from email'].map(ex => (
                  <button key={ex} onClick={() => setPrompt(ex)}
                    className="text-xs px-2 py-1 rounded font-mono transition-all"
                    style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>
                    {ex}
                  </button>
                ))}
              </div>
              <button onClick={() => handleAiTransform(true)} disabled={aiLoading || !prompt.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: '#6c63ff', color: '#fff' }}>
                {aiLoading
                  ? <><div className="w-4 h-4 rounded-full border-2 spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Generating...</>
                  : <><Wand2 size={14} /> Generate Preview</>}
              </button>
            </div>
          </div>

          {/* Pending transform preview */}
          {pendingTransform && (
            <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #3d2f6e' }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ background: '#1a1230', borderBottom: '1px solid #3d2f6e' }}>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium" style={{ color: '#a78bfa' }}>⚡ Generated Transform</p>
                    {pendingTransform.self_healed && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                        style={{ background: '#0d2e19', color: '#4ade80', border: '1px solid #1f4027' }}>
                        🔁 Self-healed · {pendingTransform.attempts} attempts
                      </span>
                    )}
                    {pendingTransform.attempts > 1 && !pendingTransform.self_healed && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                        style={{ background: '#1a1408', color: '#fbbf24', border: '1px solid #3f2d10' }}>
                        ⚠ {pendingTransform.attempts} attempts
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#6b6b8a' }}>{pendingTransform.description}</p>
                  {pendingTransform.fix_explanation && (
                    <p className="text-xs mt-1.5 px-2 py-1 rounded"
                      style={{ background: '#0d2e19', color: '#86efac', border: '1px solid #1f4027' }}>
                      💡 {pendingTransform.fix_explanation}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPendingTransform(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>
                    Discard
                  </button>
                  <button onClick={() => handleApply(pendingTransform.transform_id)}
                    disabled={applyingId === pendingTransform.transform_id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                    style={{ background: '#166534', color: '#4ade80' }}>
                    {applyingId === pendingTransform.transform_id
                      ? <div className="w-3 h-3 rounded-full border spin" style={{ borderColor: '#4ade80', borderTopColor: 'transparent' }} />
                      : <Check size={12} />} Apply to Dataset
                  </button>
                </div>
              </div>

              {/* Generated code */}
              <div className="px-5 py-3" style={{ background: '#0a0a0f', borderBottom: '1px solid #1e1e2e' }}>
                <p className="text-xs font-mono uppercase mb-2" style={{ color: '#6b6b8a' }}>Generated Pandas Code</p>
                <pre className="text-xs rounded-lg p-3 overflow-x-auto" style={{ background: '#0d0d14', color: '#a78bfa', border: '1px solid #1e1e2e', fontFamily: 'DM Mono, monospace' }}>
                  {pendingTransform.pandas_code}
                </pre>
              </div>

              {/* Preview rows */}
              {pendingTransform.preview_rows?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="df-table">
                    <thead>
                      <tr>
                        {Object.keys(pendingTransform.preview_rows[0]).slice(0, 6).map(h => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingTransform.preview_rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {Object.keys(pendingTransform.preview_rows[0]).slice(0, 6).map(h => <td key={h}>{row[h] ?? ''}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AutoFix tab */}
      {tab === 'autofix' && (
        <div>
          <p className="text-sm mb-4" style={{ color: '#6b6b8a' }}>Select the fixes you want to apply. Preview first to see what will change.</p>
          <div className="space-y-2 mb-5">
            {AUTOFIX_OPTIONS.map(opt => (
              <div key={opt.key}
                onClick={() => toggleFix(opt.key)}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all`}
                style={{
                  background: selectedFixes.includes(opt.key) ? '#1a1230' : '#0d0d14',
                  border: `1px solid ${selectedFixes.includes(opt.key) ? '#3d2f6e' : '#1e1e2e'}`
                }}>
                <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0`}
                  style={{
                    background: selectedFixes.includes(opt.key) ? '#6c63ff' : '#1a1a24',
                    border: `1px solid ${selectedFixes.includes(opt.key) ? '#6c63ff' : '#2a2a3a'}`
                  }}>
                  {selectedFixes.includes(opt.key) && <Check size={10} color="#fff" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: selectedFixes.includes(opt.key) ? '#a78bfa' : '#e8e6f0' }}>{opt.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#6b6b8a' }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={handleAutofixPreview} disabled={autofixLoading || !selectedFixes.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
              style={{ background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e' }}>
              {autofixLoading ? <div className="w-4 h-4 rounded-full border-2 spin" style={{ borderColor: '#3d2f6e', borderTopColor: '#a78bfa' }} /> : <Play size={14} />}
              Preview Changes
            </button>
            {autofixPreview && (
              <button onClick={handleAutofixApply} disabled={autofixLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                style={{ background: '#166534', color: '#4ade80' }}>
                <Check size={14} /> Apply All Fixes
              </button>
            )}
          </div>

          {/* AutoFix preview */}
          {autofixPreview && (
            <div className="mt-5 rounded-xl overflow-hidden" style={{ border: '1px solid #1f4027' }}>
              <div className="px-4 py-3" style={{ background: '#0d2e19', borderBottom: '1px solid #1f4027' }}>
                <p className="text-sm font-medium" style={{ color: '#4ade80' }}>Fix Summary</p>
              </div>
              <div className="p-4 space-y-2">
                {autofixPreview.summary.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: '#0d2e19', color: '#4ade80' }}>{s.fix}</span>
                    <span style={{ color: '#c8c6d8' }}>{s.description}</span>
                    {s.cells_fixed != null && <span className="text-xs" style={{ color: '#6b6b8a' }}>{s.cells_fixed} cells</span>}
                    {s.rows_removed != null && <span className="text-xs" style={{ color: '#6b6b8a' }}>{s.rows_removed} rows removed</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div>
          {historyLoading ? (
            <div className="text-center py-10" style={{ color: '#6b6b8a' }}>Loading...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-dashed" style={{ borderColor: '#2a2a3a', color: '#6b6b8a' }}>
              <Clock size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No transforms applied yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(tx => (
                <div key={tx.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e1e2e' }}>
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    style={{ background: '#0d0d14' }}
                    onClick={() => setExpandedTransform(expandedTransform === tx.id ? null : tx.id)}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{ background: tx.applied ? '#0d2e19' : '#1a1230', color: tx.applied ? '#4ade80' : '#a78bfa' }}>
                        {tx.applied ? '✓ Applied' : '○ Pending'}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>
                        {tx.type}
                      </span>
                      <span className="text-sm" style={{ color: '#c8c6d8' }}>{tx.prompt || 'AutoFix'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {tx.rows_affected > 0 && (
                        <span className="text-xs" style={{ color: '#6b6b8a' }}>{tx.rows_affected} rows</span>
                      )}
                      {expandedTransform === tx.id ? <ChevronUp size={14} style={{ color: '#6b6b8a' }} /> : <ChevronDown size={14} style={{ color: '#6b6b8a' }} />}
                    </div>
                  </div>
                  {expandedTransform === tx.id && tx.pandas_code && (
                    <div className="px-4 py-3" style={{ background: '#0a0a0f', borderTop: '1px solid #1e1e2e' }}>
                      <p className="text-xs font-mono uppercase mb-2" style={{ color: '#6b6b8a' }}>Pandas Code</p>
                      <pre className="text-xs rounded-lg p-3 overflow-x-auto" style={{ background: '#0d0d14', color: '#a78bfa', border: '1px solid #1e1e2e', fontFamily: 'DM Mono, monospace' }}>
                        {tx.pandas_code}
                      </pre>
                      {!tx.applied && (
                        <button onClick={() => handleApply(tx.id)} disabled={applyingId === tx.id}
                          className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                          style={{ background: '#166534', color: '#4ade80' }}>
                          <Check size={12} /> Apply This Transform
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}