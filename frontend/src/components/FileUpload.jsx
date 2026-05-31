import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, ArrowRight, Table, Layers, CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { uploadFile, confirmSheet } from '../utils/api'

const ALLOWED = ['csv', 'tsv', 'xlsx', 'xls', 'json']

export default function FileUpload({ projectId, onComplete, existingWorkbooks = [], onSelectWorkbook }) {
  const [drag, setDrag] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  // Sheet selection state
  const [sheetSelectionData, setSheetSelectionData] = useState(null)
  // { tempId, filename, filePath, sheetNames }
  const [selectedSheet, setSelectedSheet] = useState(null)
  const [confirmingSheet, setConfirmingSheet] = useState(false)
  const [sheetPreviews, setSheetPreviews] = useState({})
  // { sheetName: { rowCount, colCount } } — populated lazily

  const inputRef = useRef()

  const handleFile = useCallback(async (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED.includes(ext)) {
      toast.error('Unsupported file type: .' + ext)
      return
    }
    setUploading(true)
    setProgress(0)
    setSheetSelectionData(null)
    try {
      const { data } = await uploadFile(projectId, file, setProgress)

      if (data.status === 'sheet_selection_required') {
        // Excel with multiple sheets — show selector
        setSheetSelectionData({
          tempId: data.temp_id,
          filename: data.filename,
          filePath: data.file_path,
          sheetNames: data.sheet_names,
          totalSheets: data.total_sheets,
        })
        setSelectedSheet(data.sheet_names[0]) // default to first
        toast.success(data.total_sheets + ' sheets found — select one to continue')
      } else {
        // Single sheet or non-Excel — proceed directly
        onComplete(data)
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [projectId, onComplete])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleConfirmSheet = async (importAll = false) => {
    if (!sheetSelectionData) return
    setConfirmingSheet(true)
    try {
      const { data } = await confirmSheet(
        projectId,
        sheetSelectionData.tempId,
        sheetSelectionData.filePath,
        sheetSelectionData.filename,
        selectedSheet,
        importAll,
      )

      if (data.status === 'all_sheets_imported') {
        toast.success('Imported ' + data.total + ' sheets as separate workbooks!')
        // Call onComplete with first workbook, rest appear in sidebar
        if (data.workbooks.length > 0) {
          onComplete({ ...data.workbooks[0], all_workbooks: data.workbooks })
        }
      } else {
        toast.success('Sheet "' + (data.sheet_name || selectedSheet) + '" imported!')
        onComplete(data)
      }
      setSheetSelectionData(null)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to import sheet')
    } finally {
      setConfirmingSheet(false)
    }
  }

  // ── Sheet Selection UI ────────────────────────────────────────────────────
  if (sheetSelectionData) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="font-display font-bold text-2xl text-white mb-1">Select Sheet</h2>
          <p className="text-sm" style={{ color: '#6b6b8a' }}>
            Your Excel file has {sheetSelectionData.totalSheets} sheets. Choose one to import or import all as separate workbooks.
          </p>
        </div>

        {/* File info banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5"
          style={{ background: '#0d1208', border: '1px solid #1f4027' }}>
          <FileText size={16} style={{ color: '#4ade80' }} />
          <div>
            <div className="text-sm font-medium text-white">{sheetSelectionData.filename}</div>
            <div className="text-xs font-mono mt-0.5" style={{ color: '#6b6b8a' }}>
              {sheetSelectionData.totalSheets} sheets detected
            </div>
          </div>
        </div>

        {/* Sheet list */}
        <div className="space-y-2 mb-6">
          {sheetSelectionData.sheetNames.map((name, idx) => {
            const isSelected = selectedSheet === name
            return (
              <div
                key={name}
                onClick={() => setSelectedSheet(name)}
                className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all"
                style={{
                  background: isSelected ? '#1a1230' : '#0d0d14',
                  border: '1px solid ' + (isSelected ? '#6c63ff' : '#1e1e2e'),
                }}>
                <div className="flex items-center gap-3">
                  {/* Radio */}
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: isSelected ? '#6c63ff' : '#2a2a3a' }}>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full" style={{ background: '#6c63ff' }} />
                    )}
                  </div>

                  {/* Sheet icon + name */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isSelected ? '#1a1230' : '#13131a' }}>
                    <Table size={14} style={{ color: isSelected ? '#a78bfa' : '#6b6b8a' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: isSelected ? '#a78bfa' : '#e8e6f0' }}>
                      {name}
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: '#6b6b8a' }}>
                      Sheet {idx + 1} of {sheetSelectionData.totalSheets}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <CheckCircle2 size={16} style={{ color: '#6c63ff' }} />
                )}
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => handleConfirmSheet(false)}
            disabled={confirmingSheet || !selectedSheet}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: '#6c63ff', color: '#fff' }}>
            {confirmingSheet
              ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 spin"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                  Importing...
                </>
              )
              : (
                <>
                  <Table size={14} />
                  Import "{selectedSheet}"
                </>
              )}
          </button>

          <button
            onClick={() => handleConfirmSheet(true)}
            disabled={confirmingSheet}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: '#1a1230', color: '#a78bfa', border: '1px solid #3d2f6e' }}>
            <Layers size={14} />
            Import All {sheetSelectionData.totalSheets} Sheets
          </button>

          <button
            onClick={() => setSheetSelectionData(null)}
            disabled={confirmingSheet}
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>
            Cancel
          </button>
        </div>

        {/* Info note */}
        <div className="mt-4 flex items-start gap-2 text-xs" style={{ color: '#6b6b8a' }}>
          <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            "Import All Sheets" creates a separate workbook for each sheet.
            Each workbook goes through mapping, validation, and export independently.
          </span>
        </div>
      </div>
    )
  }

  // ── Normal Upload UI ──────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-8">
        <h2 className="font-display font-bold text-2xl text-white mb-1">Upload File</h2>
        <p className="text-sm" style={{ color: '#6b6b8a' }}>
          Upload a CSV, Excel, JSON or TSV file. Multi-sheet Excel files are fully supported.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className="rounded-2xl border-2 border-dashed p-16 text-center cursor-pointer transition-all mb-6"
        style={{
          background: drag ? '#110f1e' : '#0d0d14',
          borderColor: drag ? '#6c63ff' : '#2a2a3a',
        }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current.click()}>

        <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: '#1a1230' }}>
          {uploading
            ? <div className="w-8 h-8 rounded-full border-2 spin"
                style={{ borderColor: '#3d2f6e', borderTopColor: '#a78bfa' }} />
            : <Upload size={28} style={{ color: '#a78bfa' }} />
          }
        </div>

        <h3 className="font-display font-bold text-xl text-white mb-2">
          {uploading ? 'Uploading... ' + progress + '%' : 'Drop your file here'}
        </h3>
        <p className="text-sm mb-5" style={{ color: '#6b6b8a' }}>
          or click to browse · max 50MB
        </p>

        {uploading && (
          <div className="w-48 mx-auto h-1 rounded-full overflow-hidden mb-4"
            style={{ background: '#1e1e2e' }}>
            <div className="h-full rounded-full transition-all"
              style={{ background: '#6c63ff', width: progress + '%' }} />
          </div>
        )}

        {!uploading && (
          <div className="flex gap-2 justify-center flex-wrap">
            {ALLOWED.map(f => (
              <span key={f} className="text-xs px-3 py-1 rounded-full font-mono uppercase"
                style={{ background: '#13131a', color: '#6b6b8a', border: '1px solid #1e1e2e' }}>
                {f}
              </span>
            ))}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".csv,.tsv,.xlsx,.xls,.json"
          onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }}
        />
      </div>

      {/* Multi-sheet hint */}
      <div className="flex items-center gap-2 mb-6 px-4 py-3 rounded-xl"
        style={{ background: '#13131a', border: '1px solid #1e1e2e' }}>
        <Layers size={14} style={{ color: '#a78bfa', flexShrink: 0 }} />
        <p className="text-xs" style={{ color: '#6b6b8a' }}>
          <span style={{ color: '#a78bfa' }}>Multi-sheet Excel supported.</span> If your file has multiple sheets,
          you'll be able to pick one or import all as separate workbooks.
        </p>
      </div>

      {/* Previous workbooks */}
      {existingWorkbooks.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase mb-3"
            style={{ color: '#6b6b8a', letterSpacing: '0.5px' }}>
            Previously uploaded
          </p>
          <div className="space-y-2">
            {existingWorkbooks.map(wb => (
              <div
                key={wb.id}
                onClick={() => onSelectWorkbook(wb)}
                className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all group"
                style={{ background: '#0d0d14', border: '1px solid #1e1e2e' }}>
                <div className="flex items-center gap-3">
                  <FileText size={16} style={{ color: '#a78bfa' }} />
                  <div>
                    <div className="text-sm text-white font-medium">
                      {wb.original_filename || wb.name}
                    </div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: '#6b6b8a' }}>
                      {wb.row_count} rows · {wb.col_count} cols ·{' '}
                      {wb.validation_rules?.sheet_name
                        ? 'Sheet: ' + wb.validation_rules.sheet_name + ' · '
                        : ''}
                      <span className="capitalize">{wb.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded font-mono"
                    style={
                      wb.status === 'exported'
                        ? { background: '#0d2e19', color: '#4ade80' }
                        : wb.status === 'validated'
                        ? { background: '#1a1408', color: '#fbbf24' }
                        : { background: '#1a1230', color: '#a78bfa' }
                    }>
                    {wb.status}
                  </span>
                  <ArrowRight size={14} style={{ color: '#3d2f6e' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
