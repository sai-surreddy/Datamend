import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Database, Trash2, ArrowRight, Layers } from 'lucide-react'
import toast from 'react-hot-toast'
import { getProjects, createProject, deleteProject } from '../utils/api'

const DEFAULT_SCHEMA = [
  { key: 'id', label: 'ID', type: 'integer', required: true },
  { key: 'full_name', label: 'Full Name', type: 'string', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: false },
  { key: 'company', label: 'Company', type: 'string', required: false },
  { key: 'age', label: 'Age', type: 'integer', required: false },
  { key: 'country', label: 'Country', type: 'string', required: false },
  { key: 'status', label: 'Status', type: 'enum', required: false, enum_values: ['active', 'inactive', 'pending'] },
]

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const navigate = useNavigate()

  useEffect(() => { fetchProjects() }, [])

  const fetchProjects = async () => {
    try {
      const { data } = await getProjects()
      setProjects(data)
    } catch { toast.error('Failed to load projects') }
    finally { setLoading(false) }
  }

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('Project name required')
    try {
      const { data } = await createProject({ ...form, target_schema: DEFAULT_SCHEMA })
      toast.success('Project created!')
      navigate(`/project/${data.id}`)
    } catch { toast.error('Failed to create project') }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this project and all its workbooks?')) return
    try {
      await deleteProject(id)
      setProjects(p => p.filter(x => x.id !== id))
      toast.success('Deleted')
    } catch { toast.error('Failed to delete') }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0f' }}>
      {/* Topbar */}
      <header className="flex items-center justify-between px-8 h-14 border-b border-border sticky top-0 z-10" style={{ background: '#0d0d14' }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold font-display"
            style={{ background: 'linear-gradient(135deg,#6c63ff,#a78bfa)' }}>D</div>
          <span className="font-display font-bold text-lg text-white tracking-tight">DataFlow</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full font-mono" style={{ background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e' }}>⚡ AI-Powered</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-12">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="font-display font-bold text-4xl text-white mb-3 tracking-tight">Data Preparation</h1>
          <p className="text-gray-400 text-lg">Upload, map, validate and transform your data with AI.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: 'Total Projects', value: projects.length },
            { label: 'Total Workbooks', value: projects.reduce((a, p) => a + (p.workbook_count || 0), 0) },
            { label: 'Supported Formats', value: '4' },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4" style={{ background: '#0d0d14', border: '1px solid #1e1e2e' }}>
              <div className="font-display font-bold text-2xl text-white">{s.value}</div>
              <div className="text-xs font-mono mt-1" style={{ color: '#6b6b8a' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Projects */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-lg text-white">Projects</h2>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: '#6c63ff', color: '#fff' }}>
            <Plus size={15} /> New Project
          </button>
        </div>

        {/* New project form */}
        {showNew && (
          <div className="rounded-xl p-5 mb-5 border" style={{ background: '#0d0d14', borderColor: '#3d2f6e' }}>
            <h3 className="font-display font-semibold text-white mb-4">Create Project</h3>
            <input className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: '#13131a', border: '1px solid #2a2a3a', color: '#e8e6f0' }}
              placeholder="Project name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input className="w-full mb-4 px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: '#13131a', border: '1px solid #2a2a3a', color: '#e8e6f0' }}
              placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <p className="text-xs mb-4" style={{ color: '#6b6b8a' }}>A default CRM schema will be created. You can customize it inside the project.</p>
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#6c63ff', color: '#fff' }}>Create →</button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-dashed" style={{ borderColor: '#2a2a3a' }}>
            <Layers size={40} className="mx-auto mb-4 opacity-30" style={{ color: '#6b6b8a' }} />
            <p className="text-gray-500 mb-4">No projects yet</p>
            <button onClick={() => setShowNew(true)} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ background: '#6c63ff', color: '#fff' }}>
              Create your first project
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map(p => (
              <div key={p.id} onClick={() => navigate(`/project/${p.id}`)}
                className="flex items-center justify-between px-5 py-4 rounded-xl cursor-pointer group transition-all"
                style={{ background: '#0d0d14', border: '1px solid #1e1e2e' }}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#1a1230' }}>
                    <Database size={16} style={{ color: '#a78bfa' }} />
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">{p.name}</div>
                    {p.description && <div className="text-xs mt-0.5" style={{ color: '#6b6b8a' }}>{p.description}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono" style={{ color: '#4b4b6b' }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  <button onClick={e => handleDelete(e, p.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all"
                    style={{ color: '#f87171' }}>
                    <Trash2 size={13} />
                  </button>
                  <ArrowRight size={15} style={{ color: '#3d2f6e' }} className="group-hover:text-accent transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
