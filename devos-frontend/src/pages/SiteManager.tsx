import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * T4.5 — Site Manager Mobile Interface
 * Submit purchase requests with evidence photos.
 * Submit progress updates (percent_complete, summary, photos).
 * View purchase request status.
 * Mobile-first, responsive design.
 */

interface Project {
  id: string
  name: string
  location: string
}

interface BudgetPhase {
  id: string
  phase_name: string
  category: string
}

interface PurchaseRequest {
  id: string
  description: string
  material_name: string
  quantity: number
  unit: string
  unit_rate_kobo: number
  status: string
  guardian_flag: string | null
  created_at: string
}

interface ProgressUpdate {
  id: string
  percent_complete: number
  summary: string | null
  submitted_at: string
}

const FLAG_COLORS: Record<string, string> = {
  CLEAR: 'bg-green-100 text-green-800',
  INFO: 'bg-blue-100 text-blue-700',
  WARNING: 'bg-yellow-100 text-yellow-800',
  CRITICAL: 'bg-red-100 text-red-800',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  reviewing: 'bg-yellow-100 text-yellow-800',
}

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`
}

type Tab = 'requests' | 'progress' | 'new-request' | 'new-progress'

export default function SiteManager() {
  const [tab, setTab] = useState<Tab>('requests')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [phases, setPhases] = useState<BudgetPhase[]>([])
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [updates, setUpdates] = useState<ProgressUpdate[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  // Purchase request form
  const [prForm, setPrForm] = useState({
    description: '', material_name: '', quantity: '1',
    unit: 'bag', unit_rate_kobo_display: '', supplier_name: '',
    phase_id: '', evidence_urls: [] as string[],
  })
  const [evidenceInput, setEvidenceInput] = useState('')

  // Progress update form
  const [puForm, setPuForm] = useState({
    phase_id: '', percent_complete: '0', summary: '',
    photo_urls: [] as string[],
  })
  const [photoInput, setPhotoInput] = useState('')

  useEffect(() => {
    loadProjects()
  }, [])

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id,name,location')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    if (data?.length) setSelectedProject(data[0])
  }

  useEffect(() => {
    if (!selectedProject) return
    loadData()
    loadPhases()
  }, [selectedProject])

  async function loadPhases() {
    const { data } = await supabase
      .from('budget_phases')
      .select('id,phase_name,category')
      .eq('project_id', selectedProject!.id)
    setPhases(data || [])
  }

  async function loadData() {
    if (!selectedProject) return
    setLoading(true)
    const [{ data: prs }, { data: pus }] = await Promise.all([
      supabase.from('purchase_requests')
        .select('id,description,material_name,quantity,unit,unit_rate_kobo,status,guardian_flag,created_at')
        .eq('project_id', selectedProject.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('progress_updates')
        .select('id,percent_complete,summary,submitted_at')
        .eq('project_id', selectedProject.id)
        .order('submitted_at', { ascending: false })
        .limit(20),
    ])
    setRequests(prs || [])
    setUpdates(pus || [])
    setLoading(false)
  }

  async function submitPurchaseRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProject) return
    if (prForm.evidence_urls.length === 0) {
      alert('Please add at least one evidence photo URL.')
      return
    }
    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/on-purchase-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        organisation_id: (await supabase.from('projects').select('organisation_id').eq('id', selectedProject.id).single()).data?.organisation_id,
        project_id: selectedProject.id,
        phase_id: prForm.phase_id || null,
        description: prForm.description,
        material_name: prForm.material_name || prForm.description,
        quantity: parseFloat(prForm.quantity),
        unit: prForm.unit,
        unit_rate_kobo: Math.round(parseFloat(prForm.unit_rate_kobo_display.replace(/,/g, '')) * 100),
        supplier_name: prForm.supplier_name || null,
        evidence_urls: prForm.evidence_urls,
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (json.success) {
      setSuccessMsg('Purchase request submitted. GUARDIAN is analyzing…')
      setPrForm({ description: '', material_name: '', quantity: '1', unit: 'bag', unit_rate_kobo_display: '', supplier_name: '', phase_id: '', evidence_urls: [] })
      setTab('requests')
      loadData()
    } else {
      alert(json.error || 'Submission failed')
    }
  }

  async function submitProgressUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProject) return
    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: org } = await supabase.from('projects').select('organisation_id').eq('id', selectedProject.id).single()
    await supabase.from('progress_updates').insert({
      organisation_id: org?.organisation_id,
      project_id: selectedProject.id,
      phase_id: puForm.phase_id || null,
      reported_by: user?.id,
      percent_complete: parseInt(puForm.percent_complete),
      summary: puForm.summary || null,
      photo_urls: puForm.photo_urls,
      submitted_at: new Date().toISOString(),
    })
    setSubmitting(false)
    setSuccessMsg('Progress update submitted successfully.')
    setPuForm({ phase_id: '', percent_complete: '0', summary: '', photo_urls: [] })
    setTab('progress')
    loadData()
  }

  function addEvidence() {
    if (!evidenceInput.trim()) return
    setPrForm(f => ({ ...f, evidence_urls: [...f.evidence_urls, evidenceInput.trim()] }))
    setEvidenceInput('')
  }
  function addPhoto() {
    if (!photoInput.trim()) return
    setPuForm(f => ({ ...f, photo_urls: [...f.photo_urls, photoInput.trim()] }))
    setPhotoInput('')
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-lg mx-auto">
      {/* Mobile header */}
      <div className="bg-blue-700 text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold">Site Manager</h1>
          <select
            value={selectedProject?.id || ''}
            onChange={e => setSelectedProject(projects.find(p => p.id === e.target.value) || null)}
            className="text-xs bg-blue-600 border border-blue-500 rounded px-2 py-1 text-white"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {/* Tab bar */}
        <div className="flex gap-1 bg-blue-800 rounded-lg p-1">
          {([
            { id: 'requests', label: 'Requests' },
            { id: 'progress', label: 'Progress' },
            { id: 'new-request', label: '+ Purchase' },
            { id: 'new-progress', label: '+ Update' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSuccessMsg('') }}
              className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                tab === t.id ? 'bg-white text-blue-800' : 'text-blue-200 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 text-sm text-green-800">
            {successMsg}
          </div>
        )}

        {/* Purchase Requests list */}
        {tab === 'requests' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{requests.length} requests</p>
            {loading && <p className="text-sm text-gray-400">Loading…</p>}
            {requests.map(pr => (
              <div key={pr.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{pr.material_name || pr.description}</p>
                    <p className="text-xs text-gray-500">{pr.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[pr.status] || 'bg-gray-100 text-gray-600'}`}>
                      {pr.status}
                    </span>
                    {pr.guardian_flag && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FLAG_COLORS[pr.guardian_flag] || ''}`}>
                        {pr.guardian_flag}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{pr.quantity} {pr.unit} @ {naira(pr.unit_rate_kobo)}/{pr.unit}</span>
                  <span className="font-semibold text-gray-800">{naira(pr.quantity * pr.unit_rate_kobo)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{new Date(pr.created_at).toLocaleDateString()}</p>
              </div>
            ))}
            {!loading && requests.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No purchase requests yet.</p>
            )}
          </div>
        )}

        {/* Progress updates list */}
        {tab === 'progress' && (
          <div className="space-y-3">
            {loading && <p className="text-sm text-gray-400">Loading…</p>}
            {updates.map(u => (
              <div key={u.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-blue-700">{u.percent_complete}%</span>
                  <span className="text-xs text-gray-400">{new Date(u.submitted_at).toLocaleDateString()}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${u.percent_complete}%` }} />
                </div>
                {u.summary && <p className="text-sm text-gray-700">{u.summary}</p>}
              </div>
            ))}
            {!loading && updates.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">No progress updates yet.</p>
            )}
          </div>
        )}

        {/* New purchase request form */}
        {tab === 'new-request' && (
          <form onSubmit={submitPurchaseRequest} className="space-y-4">
            <h2 className="font-semibold text-gray-800">New Purchase Request</h2>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Phase (optional)</label>
              <select value={prForm.phase_id}
                onChange={e => setPrForm(f => ({ ...f, phase_id: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">— No specific phase —</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.phase_name} ({p.category})</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Material / Item *</label>
              <input required placeholder="e.g. Dangote Cement 50kg" value={prForm.material_name}
                onChange={e => setPrForm(f => ({ ...f, material_name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Description / Purpose *</label>
              <textarea required rows={2} placeholder="What is this for?" value={prForm.description}
                onChange={e => setPrForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Quantity *</label>
                <input required type="number" min="1" step="any" value={prForm.quantity}
                  onChange={e => setPrForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Unit *</label>
                <input required placeholder="bag, m3, length…" value={prForm.unit}
                  onChange={e => setPrForm(f => ({ ...f, unit: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Unit Rate (₦) *</label>
              <input required placeholder="e.g. 8500 for ₦8,500" value={prForm.unit_rate_kobo_display}
                onChange={e => setPrForm(f => ({ ...f, unit_rate_kobo_display: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" />
              {prForm.unit_rate_kobo_display && prForm.quantity && (
                <p className="text-xs text-gray-400 mt-1">
                  Total: ₦{(parseFloat(prForm.unit_rate_kobo_display.replace(/,/g, '') || '0') * parseFloat(prForm.quantity || '0')).toLocaleString()}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Supplier Name (optional)</label>
              <input placeholder="Supplier / vendor name" value={prForm.supplier_name}
                onChange={e => setPrForm(f => ({ ...f, supplier_name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Evidence Photos * (URLs)</label>
              <div className="flex gap-2 mb-2">
                <input placeholder="Paste photo URL" value={evidenceInput}
                  onChange={e => setEvidenceInput(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={addEvidence}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm">Add</button>
              </div>
              {prForm.evidence_urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline truncate flex-1">{url}</a>
                  <button type="button" onClick={() => setPrForm(f => ({ ...f, evidence_urls: f.evidence_urls.filter((_, j) => j !== i) }))}
                    className="text-red-400 text-xs">✕</button>
                </div>
              ))}
              {prForm.evidence_urls.length === 0 && (
                <p className="text-xs text-amber-600">At least 1 evidence photo required</p>
              )}
            </div>

            <button type="submit" disabled={submitting}
              className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Purchase Request'}
            </button>
          </form>
        )}

        {/* New progress update form */}
        {tab === 'new-progress' && (
          <form onSubmit={submitProgressUpdate} className="space-y-4">
            <h2 className="font-semibold text-gray-800">New Progress Update</h2>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Phase (optional)</label>
              <select value={puForm.phase_id}
                onChange={e => setPuForm(f => ({ ...f, phase_id: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">— Overall project —</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.phase_name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Completion: <strong className="text-blue-700">{puForm.percent_complete}%</strong>
              </label>
              <input type="range" min="0" max="100" step="5" value={puForm.percent_complete}
                onChange={e => setPuForm(f => ({ ...f, percent_complete: e.target.value }))}
                className="w-full accent-blue-600" />
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${puForm.percent_complete}%` }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Summary</label>
              <textarea rows={3} placeholder="Describe what was done today…" value={puForm.summary}
                onChange={e => setPuForm(f => ({ ...f, summary: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2.5 text-sm resize-none" />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Site Photos (URLs)</label>
              <div className="flex gap-2 mb-2">
                <input placeholder="Paste photo URL" value={photoInput}
                  onChange={e => setPhotoInput(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <button type="button" onClick={addPhoto}
                  className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm">Add</button>
              </div>
              {puForm.photo_urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2 mb-1">
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline truncate flex-1">{url}</a>
                  <button type="button" onClick={() => setPuForm(f => ({ ...f, photo_urls: f.photo_urls.filter((_, j) => j !== i) }))}
                    className="text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>

            <button type="submit" disabled={submitting}
              className="w-full bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Progress Update'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
