import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, GitMerge, CheckCircle, Download, Wand2, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { getProject, getProjectWorkbooks } from '../utils/api'
import FileUpload from '../components/FileUpload'
import MappingEditor from '../components/MappingEditor'
import ValidationPanel from '../components/ValidationPanel'
import TransformPanel from '../components/TransformPanel'
import ExportPanel from '../components/ExportPanel'

const STEPS = [
  { id: 'upload',   label: 'Upload',       icon: Upload       },
  { id: 'map',      label: 'Map Columns',  icon: GitMerge     },
  { id: 'validate', label: 'Validate',     icon: CheckCircle  },
  { id: 'transform',label: 'Transform',    icon: Wand2        },
  { id: 'export',   label: 'Export',       icon: Download     },
]

export default function Project() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [project, setProject]             = useState(null)
  const [workbooks, setWorkbooks]         = useState([])
  const [activeWorkbook, setActiveWorkbook] = useState(null)
  const [step, setStep]                   = useState('upload')
  const [validationResult, setValidationResult] = useState(null)
  const [loading, setLoading]             = useState(true)

  useEffect(() => { fetchProject() }, [id])

  const fetchProject = async (keepStep = false) => {
    try {
      const [{ data: proj }, { data: wbs }] = await Promise.all([
        getProject(id),
        getProjectWorkbooks(id),
      ])
      setProject(proj)
      setWorkbooks(wbs)
      if (wbs.length > 0) {
        const latest = wbs[wbs.length - 1]
        setActiveWorkbook(latest)
        // Only auto-set step on initial load, not on refresh
        if (!keepStep) {
          const statusStepMap = {
            uploaded:  'map',
            mapped:    'validate',
            validated: 'validate',
            exported:  'export',
          }
          setStep(statusStepMap[latest.status] || 'upload')
        }
      }
    } catch { toast.error('Failed to load project') }
    finally { setLoading(false) }
  }

  const stepIndex = (s) => STEPS.findIndex(x => x.id === s)

  const canAccess = (s) => {
    if (s === 'upload')    return true
    if (s === 'map')       return !!activeWorkbook
    if (s === 'validate')  return activeWorkbook?.status && ['mapped','validated','exported'].includes(activeWorkbook.status)
    if (s === 'transform') return activeWorkbook?.status && ['validated','exported'].includes(activeWorkbook.status)
    if (s === 'export')    return activeWorkbook?.status && ['validated','exported'].includes(activeWorkbook.status)
    return false
  }

  const handleUploadComplete = (result) => {
    setActiveWorkbook({ id: result.workbook_id, status: 'uploaded', ...result })
    fetchProject()
    setStep('map')
    toast.success('Parsed ' + result.row_count + ' rows · ' + result.col_count + ' columns')
  }

  const handleMappingComplete = (result) => {
    setActiveWorkbook(w => ({ ...w, status: 'mapped', column_mapping: result.mapping }))
    setStep('validate')
    // ← DO NOT auto-jump further
  }

  // ── KEY FIX: validation complete does NOT change step ──────────────────
  // It only stores the result. User manually clicks Transform when ready.
  const handleValidationComplete = (result) => {
    setValidationResult(result)
    setActiveWorkbook(w => ({ ...w, status: 'validated' }))
    // ← NO setStep('transform') here — user stays on validate page to review
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="w-6 h-6 rounded-full border-2 spin" style={{ borderColor: '#3d2f6e', borderTopColor: '#a78bfa' }} />
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0a0f' }}>
      {/* Topbar */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-border sticky top-0 z-10" style={{ background: '#0d0d14' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: '#6b6b8a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans,sans-serif' }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5" style={{ background: '#1e1e2e' }} />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#6c63ff,#a78bfa)' }}>D</div>
            <span className="font-display font-semibold text-white text-sm">{project?.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeWorkbook && (
            <span className="text-xs font-mono px-2 py-1 rounded"
              style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>
              {activeWorkbook.original_filename || activeWorkbook.name}
            </span>
          )}
          <span className="text-xs px-2 py-1 rounded-full font-mono"
            style={{ background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e' }}>
            ⚡ AI
          </span>
        </div>
      </header>

      {/* Step nav */}
      <div className="px-6 py-3 border-b" style={{ background: '#0d0d14', borderColor: '#1e1e2e' }}>
        <div className="flex items-center gap-1 flex-wrap">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done       = stepIndex(step) > i
            const active     = step === s.id
            const accessible = canAccess(s.id)
            return (
              <div key={s.id} className="flex items-center gap-1">
                <button
                  disabled={!accessible}
                  onClick={() => accessible && setStep(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    cursor: accessible ? 'pointer' : 'not-allowed',
                    opacity: accessible ? 1 : 0.4,
                    border: active ? '1px solid #3d2f6e' : 'none',
                    background: active ? '#1a1230' : 'transparent',
                    color: active ? '#a78bfa' : done ? '#4ade80' : '#6b6b8a',
                    fontFamily: 'DM Sans,sans-serif',
                    transition: 'all 0.15s',
                  }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0,
                    background: done ? '#0d2e19' : active ? '#6c63ff' : '#1a1a24',
                    color: done ? '#4ade80' : active ? '#fff' : '#6b6b8a',
                  }}>
                    {done ? '✓' : i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={12} style={{ color: '#2a2a3a' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-6 py-6" style={{ maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        {step === 'upload' && (
          <FileUpload
            projectId={id}
            onComplete={handleUploadComplete}
            existingWorkbooks={workbooks}
            onSelectWorkbook={(wb) => { setActiveWorkbook(wb); setStep('map') }}
          />
        )}
        {step === 'map' && activeWorkbook && (
          <MappingEditor
            workbook={activeWorkbook}
            schema={project?.target_schema || []}
            onComplete={handleMappingComplete}
          />
        )}
        {step === 'validate' && activeWorkbook && (
          <ValidationPanel
            workbook={activeWorkbook}
            schema={project?.target_schema || []}
            onComplete={handleValidationComplete}
          />
        )}
        {step === 'transform' && activeWorkbook && (
          <TransformPanel
            workbook={activeWorkbook}
            onRefresh={() => fetchProject(true)}
          />
        )}
        {step === 'export' && activeWorkbook && (
          <ExportPanel
            workbook={activeWorkbook}
            projectId={id}
            validationResult={validationResult}
          />
        )}
      </main>
    </div>
  )
}