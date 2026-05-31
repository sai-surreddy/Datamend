import { useState, useEffect } from 'react'
import { Download, Webhook, Plus, Trash2, Send, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { exportDownload, createWebhook, listWebhooks, pushWebhook, deleteWebhook } from '../utils/api'

const FORMAT_OPTIONS = [
  { key: 'csv',  label: 'CSV',          desc: 'Comma-separated — works with Excel, Google Sheets' },
  { key: 'xlsx', label: 'Excel (.xlsx)', desc: 'Native Excel format with formatted columns' },
  { key: 'json', label: 'JSON',          desc: 'Structured JSON array — ideal for APIs' },
]

export default function ExportPanel({ workbook, projectId, validationResult }) {
  const [format, setFormat]           = useState('csv')
  const [onlyValid, setOnlyValid]     = useState(true)
  const [mappedOnly, setMappedOnly]   = useState(false)  // ← disabled by default
  const [exporting, setExporting]     = useState(false)
  const [tab, setTab]                 = useState('export')
  const [webhooks, setWebhooks]       = useState([])
  const [newHook, setNewHook]         = useState({ name: '', url: '', secret: '' })
  const [creatingHook, setCreatingHook] = useState(false)
  const [showNewHook, setShowNewHook] = useState(false)
  const [pushingHook, setPushingHook] = useState(null)

  useEffect(() => { loadWebhooks() }, [projectId])

  const loadWebhooks = async () => {
    try {
      const { data } = await listWebhooks(projectId)
      setWebhooks(data)
    } catch {}
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const result = await exportDownload({
        workbook_id: workbook.id,
        format,
        only_valid: onlyValid,
        mapped_only: mappedOnly,
      })
      toast.success('Exported ' + result.rowCount + ' rows as ' + result.filename)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleCreateWebhook = async () => {
    if (!newHook.name || !newHook.url) return toast.error('Name and URL are required')
    setCreatingHook(true)
    try {
      await createWebhook(projectId, {
        name: newHook.name,
        url: newHook.url,
        secret: newHook.secret || undefined,
        events: ['export.complete'],
      })
      toast.success('Webhook created!')
      setNewHook({ name: '', url: '', secret: '' })
      setShowNewHook(false)
      await loadWebhooks()
    } catch {
      toast.error('Failed to create webhook')
    } finally {
      setCreatingHook(false)
    }
  }

  const handlePush = async (webhookId) => {
    setPushingHook(webhookId)
    try {
      const { data } = await pushWebhook({ workbook_id: workbook.id, webhook_id: webhookId })
      if (data.success) {
        toast.success('Webhook delivered! Status: ' + data.status_code)
      } else {
        toast.error('Webhook failed: ' + (data.error || data.response))
      }
    } catch {
      toast.error('Failed to push webhook')
    } finally {
      setPushingHook(null)
    }
  }

  const handleDeleteWebhook = async (id) => {
    if (!confirm('Delete this webhook?')) return
    try {
      await deleteWebhook(id)
      setWebhooks(w => w.filter(x => x.id !== id))
      toast.success('Webhook deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  const summary = validationResult || workbook.validation_summary

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Export Data</h2>
        <p style={{ color: '#6b6b8a', fontSize: 13, margin: 0 }}>
          Download your cleaned data or push it to a destination via webhook.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 24, padding: 4, borderRadius: 10, background: '#0d0d14', border: '1px solid #1e1e2e', width: 'fit-content' }}>
        {[
          { key: 'export',   label: '⬇ Download' },
          { key: 'webhooks', label: '🔗 Webhooks (' + webhooks.length + ')' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: 'none', fontFamily: 'DM Sans,sans-serif',
            background: tab === t.key ? '#1a1230' : 'transparent',
            color:      tab === t.key ? '#a78bfa'  : '#6b6b8a',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── EXPORT TAB ── */}
      {tab === 'export' && (
        <div>
          {/* Validation summary */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'Total Rows', value: summary.total_rows,   color: '#e8e6f0', bg: '#0d0d14', border: '#1e1e2e' },
                { label: 'Valid Rows', value: summary.valid_rows,   color: '#4ade80', bg: '#0d2e19', border: '#1f4027' },
                { label: 'Warnings',   value: summary.warning_rows, color: '#fbbf24', bg: '#1a1408', border: '#3f2d10' },
                { label: 'Errors',     value: summary.error_rows,   color: '#f87171', bg: '#1a0808', border: '#3f1515' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: '1px solid ' + s.border, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: 'Syne,sans-serif' }}>{s.value ?? '—'}</div>
                  <div style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Format selection */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Export Format</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              {FORMAT_OPTIONS.map(f => (
                <div key={f.key} onClick={() => setFormat(f.key)} style={{
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                  background: format === f.key ? '#1a1230' : '#0d0d14',
                  border: '1px solid ' + (format === f.key ? '#3d2f6e' : '#1e1e2e'),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', border: '2px solid ' + (format === f.key ? '#6c63ff' : '#2a2a3a'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {format === f.key && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6c63ff' }} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono,monospace', color: format === f.key ? '#a78bfa' : '#e8e6f0' }}>{f.label}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#6b6b8a', margin: 0, paddingLeft: 22 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>Options</p>
            {[
              {
                key: 'onlyValid',
                label: 'Export only valid rows',
                desc: 'Skip rows with validation errors',
                value: onlyValid,
                set: setOnlyValid,
                disabled: false,
              },
              {
                key: 'mappedOnly',
                label: 'Use mapped column names',
                desc: 'Rename columns to target schema field names (disabled — exports original column names)',
                value: mappedOnly,
                set: setMappedOnly,
                disabled: false,   // user can enable it, but default is OFF
              },
            ].map(opt => (
              <div key={opt.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #0f0f18' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div style={{ fontSize: 13, color: opt.disabled ? '#4b4b6b' : '#e8e6f0', marginBottom: 2 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#6b6b8a' }}>{opt.desc}</div>
                </div>
                {/* Toggle switch */}
                <div
                  onClick={() => !opt.disabled && opt.set(!opt.value)}
                  style={{
                    width: 40, height: 22, borderRadius: 11, cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    background: opt.value ? '#6c63ff' : '#2a2a3a',
                    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                    opacity: opt.disabled ? 0.4 : 1,
                  }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 3, transition: 'left 0.2s',
                    left: opt.value ? 21 : 3,
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* Export button */}
          <button onClick={handleExport} disabled={exporting} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px',
            borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer',
            border: 'none', fontFamily: 'DM Sans,sans-serif', opacity: exporting ? 0.7 : 1,
            background: 'linear-gradient(135deg,#6c63ff,#8b5cf6)',
            color: '#fff', boxShadow: '0 4px 20px rgba(108,99,255,0.35)',
            transition: 'all 0.15s',
          }}>
            {exporting
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Exporting…</>
              : <><Download size={16} /> Export {format.toUpperCase()}</>
            }
          </button>
        </div>
      )}

      {/* ── WEBHOOKS TAB ── */}
      {tab === 'webhooks' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#6b6b8a', margin: 0 }}>Push exported data to external endpoints automatically.</p>
            <button onClick={() => setShowNewHook(!showNewHook)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, fontSize: 12, cursor: 'pointer',
              background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e',
              fontFamily: 'DM Sans,sans-serif',
            }}>
              <Plus size={12} /> Add Webhook
            </button>
          </div>

          {/* New webhook form */}
          {showNewHook && (
            <div style={{ background: '#0d0d14', border: '1px solid #3d2f6e', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa', margin: '0 0 12px' }}>New Webhook</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <input value={newHook.name} onChange={e => setNewHook(h => ({ ...h, name: e.target.value }))}
                  placeholder="Name (e.g. CRM Sync)"
                  style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', color: '#e8e6f0', fontSize: 13, outline: 'none', fontFamily: 'DM Sans,sans-serif' }} />
                <input value={newHook.url} onChange={e => setNewHook(h => ({ ...h, url: e.target.value }))}
                  placeholder="Endpoint URL (https://...)"
                  style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', color: '#e8e6f0', fontSize: 13, outline: 'none', fontFamily: 'DM Mono,monospace' }} />
                <input value={newHook.secret} onChange={e => setNewHook(h => ({ ...h, secret: e.target.value }))}
                  placeholder="Secret key (optional — for HMAC signature)"
                  style={{ background: '#13131a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '8px 12px', color: '#e8e6f0', fontSize: 13, outline: 'none', fontFamily: 'DM Sans,sans-serif' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreateWebhook} disabled={creatingHook} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: '#6c63ff', color: '#fff', border: 'none', fontFamily: 'DM Sans,sans-serif',
                  opacity: creatingHook ? 0.6 : 1,
                }}>
                  {creatingHook ? 'Creating…' : <><Check size={12} /> Create</>}
                </button>
                <button onClick={() => setShowNewHook(false)} style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                  background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e', fontFamily: 'DM Sans,sans-serif',
                }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Webhook list */}
          {webhooks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b6b8a' }}>
              <Webhook size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: 14, margin: 0 }}>No webhooks configured</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {webhooks.map(wh => (
                <div key={wh.id} style={{ padding: '12px 16px', borderRadius: 12, background: '#0d0d14', border: '1px solid #1e1e2e' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: wh.active ? '#4ade80' : '#6b6b8a', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#e8e6f0' }}>{wh.name}</div>
                        <div style={{ fontSize: 11, fontFamily: 'DM Mono,monospace', color: '#6b6b8a', marginTop: 2 }}>{wh.url}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {wh.last_triggered && (
                        <span style={{ fontSize: 11, color: '#6b6b8a' }}>Last: {new Date(wh.last_triggered).toLocaleString()}</span>
                      )}
                      <button onClick={() => handlePush(wh.id)} disabled={pushingHook === wh.id} style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                        borderRadius: 7, fontSize: 11, cursor: 'pointer',
                        background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e',
                        fontFamily: 'DM Sans,sans-serif', opacity: pushingHook === wh.id ? 0.6 : 1,
                      }}>
                        {pushingHook === wh.id
                          ? <div style={{ width: 10, height: 10, border: '1.5px solid #3d2f6e', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                          : <Send size={10} />}
                        Push
                      </button>
                      <button onClick={() => handleDeleteWebhook(wh.id)} style={{
                        padding: '5px 8px', borderRadius: 7, fontSize: 11, cursor: 'pointer',
                        background: 'transparent', color: '#f87171', border: '1px solid #3f1515',
                      }}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {(wh.events || []).map(ev => (
                      <span key={ev} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e', fontFamily: 'DM Mono,monospace' }}>{ev}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}