import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

interface Project {
  id: string
  name: string
  location: string
  status: string
  organisation_id: string
}

interface BudgetPhase {
  id: string
  project_id: string
  organisation_id: string
  phase_name: string
  category: string
  allocated_kobo: number
  spent_kobo: number
  contingency_pct: number
  description?: string
  line_items?: BudgetLineItem[]
}

interface BudgetLineItem {
  id: string
  phase_id: string
  description: string
  quantity: number
  unit: string
  unit_rate_kobo: number
  total_kobo: number
}

const CATEGORIES = [
  'Foundation', 'Superstructure', 'Roofing', 'Finishes',
  'MEP', 'Landscaping', 'Contingency', 'Professional Fees', 'Other',
]

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function healthStatus(spent: number, allocated: number) {
  if (allocated === 0) return 'NONE'
  const pct = (spent / allocated) * 100
  if (pct < 70) return 'GREEN'
  if (pct < 85) return 'YELLOW'
  return 'RED'
}

function HealthBadge({ spent, allocated }: { spent: number; allocated: number }) {
  const status = healthStatus(spent, allocated)
  const pct = allocated > 0 ? Math.round((spent / allocated) * 100) : 0
  const cls: Record<string, string> = {
    GREEN: 'bg-green-100 text-green-800',
    YELLOW: 'bg-yellow-100 text-yellow-800',
    RED: 'bg-red-100 text-red-800',
    NONE: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls[status]}`}>
      {status !== 'NONE' ? `${status} ${pct}%` : 'No budget set'}
    </span>
  )
}

export default function BudgetManager() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [phases, setPhases] = useState<BudgetPhase[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null)
  const [showAddLine, setShowAddLine] = useState<string | null>(null)

  const [phaseForm, setPhaseForm] = useState({
    phase_name: '', category: CATEGORIES[0],
    allocated_display: '', contingency_pct: '5', description: '',
  })
  const [lineForm, setLineForm] = useState({
    description: '', quantity: '1', unit: 'item', rate_display: '',
  })

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('id,name,location,status,organisation_id')
      .order('created_at', { ascending: false })
    setProjects(data || [])
    if (data?.length) setSelectedProject(data[0])
  }

  const loadPhases = useCallback(async () => {
    if (!selectedProject) return
    setLoading(true)
    const [{ data: phaseData }, { data: lineData }] = await Promise.all([
      supabase.from('budget_phases').select('*').eq('project_id', selectedProject.id).order('created_at', { ascending: true }),
      supabase.from('budget_line_items').select('*').eq('project_id', selectedProject.id),
    ])
    setPhases((phaseData || []).map(p => ({
      ...p,
      line_items: (lineData || []).filter((l: BudgetLineItem) => l.phase_id === p.id),
    })))
    setLoading(false)
  }, [selectedProject])

  useEffect(() => { loadPhases() }, [loadPhases])

  async function addPhase(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProject) return
    const allocated_kobo = Math.round(parseFloat(phaseForm.allocated_display.replace(/,/g, '')) * 100)
    await supabase.from('budget_phases').insert({
      project_id: selectedProject.id,
      organisation_id: selectedProject.organisation_id,
      phase_name: phaseForm.phase_name,
      category: phaseForm.category,
      allocated_kobo,
      spent_kobo: 0,
      contingency_pct: parseFloat(phaseForm.contingency_pct) || 0,
      description: phaseForm.description || null,
    })
    setPhaseForm({ phase_name: '', category: CATEGORIES[0], allocated_display: '', contingency_pct: '5', description: '' })
    setShowAddPhase(false)
    loadPhases()
  }

  async function addLineItem(e: React.FormEvent, phase: BudgetPhase) {
    e.preventDefault()
    const unit_rate_kobo = Math.round(parseFloat(lineForm.rate_display.replace(/,/g, '')) * 100)
    await supabase.from('budget_line_items').insert({
      phase_id: phase.id,
      project_id: selectedProject!.id,
      organisation_id: phase.organisation_id,
      description: lineForm.description,
      quantity: parseFloat(lineForm.quantity),
      unit: lineForm.unit,
      unit_rate_kobo,
    })
    setLineForm({ description: '', quantity: '1', unit: 'item', rate_display: '' })
    setShowAddLine(null)
    loadPhases()
  }

  const totalAllocated = phases.reduce((s, p) => s + p.allocated_kobo, 0)
  const totalSpent = phases.reduce((s, p) => s + p.spent_kobo, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget Manager</h1>
        <select
          value={selectedProject?.id || ''}
          onChange={e => setSelectedProject(projects.find(p => p.id === e.target.value) || null)}
          className="border rounded-lg px-3 py-2 text-sm bg-white"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      {selectedProject && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Allocated', value: naira(totalAllocated), color: 'text-gray-900' },
            { label: 'Total Spent', value: naira(totalSpent), color: 'text-gray-900' },
            { label: 'Remaining', value: naira(totalAllocated - totalSpent), color: 'text-green-700' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              {card.label === 'Remaining' && <HealthBadge spent={totalSpent} allocated={totalAllocated} />}
            </div>
          ))}
        </div>
      )}

      {/* Phases */}
      <div className="space-y-3">
        {loading && <p className="text-sm text-gray-400">Loading phases…</p>}
        {phases.map(phase => {
          const isExpanded = expandedPhase === phase.id
          const hs = healthStatus(phase.spent_kobo, phase.allocated_kobo)
          const pct = phase.allocated_kobo > 0
            ? Math.min(100, Math.round((phase.spent_kobo / phase.allocated_kobo) * 100))
            : 0
          const barColor = hs === 'RED' ? 'bg-red-500' : hs === 'YELLOW' ? 'bg-yellow-400' : 'bg-green-500'

          return (
            <div key={phase.id} className="bg-white rounded-xl border overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-sm text-gray-900 truncate">{phase.phase_name}</span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0">{phase.category}</span>
                  {phase.contingency_pct > 0 && (
                    <span className="text-xs text-gray-400 flex-shrink-0">+{phase.contingency_pct}% contingency</span>
                  )}
                </div>
                <div className="flex items-center gap-4 ml-4 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Allocated</p>
                    <p className="text-sm font-medium">{naira(phase.allocated_kobo)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Spent</p>
                    <p className="text-sm font-medium">{naira(phase.spent_kobo)}</p>
                  </div>
                  <HealthBadge spent={phase.spent_kobo} allocated={phase.allocated_kobo} />
                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-gray-100 mx-4 mb-1 rounded-full overflow-hidden">
                <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
              </div>

              {/* Expanded line items */}
              {isExpanded && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  {phase.line_items?.length === 0 && (
                    <p className="text-xs text-gray-400 mb-2">No line items yet.</p>
                  )}
                  <table className="w-full text-sm mb-2">
                    <tbody>
                      {phase.line_items?.map(li => (
                        <tr key={li.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 text-gray-700">{li.description}</td>
                          <td className="py-1.5 text-gray-500 text-right">{li.quantity} {li.unit}</td>
                          <td className="py-1.5 text-gray-500 text-right">@ {naira(li.unit_rate_kobo)}</td>
                          <td className="py-1.5 font-medium text-right">{naira(li.total_kobo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {showAddLine === phase.id ? (
                    <form onSubmit={e => addLineItem(e, phase)} className="grid grid-cols-5 gap-2 mt-2">
                      <input required placeholder="Description" value={lineForm.description}
                        onChange={e => setLineForm(f => ({ ...f, description: e.target.value }))}
                        className="col-span-2 border rounded px-2 py-1 text-sm bg-white" />
                      <input required placeholder="Qty" type="number" min="0.001" step="any" value={lineForm.quantity}
                        onChange={e => setLineForm(f => ({ ...f, quantity: e.target.value }))}
                        className="border rounded px-2 py-1 text-sm bg-white" />
                      <input required placeholder="Unit" value={lineForm.unit}
                        onChange={e => setLineForm(f => ({ ...f, unit: e.target.value }))}
                        className="border rounded px-2 py-1 text-sm bg-white" />
                      <input required placeholder="Rate (₦)" value={lineForm.rate_display}
                        onChange={e => setLineForm(f => ({ ...f, rate_display: e.target.value }))}
                        className="border rounded px-2 py-1 text-sm bg-white" />
                      <div className="col-span-5 flex gap-2">
                        <button type="submit" className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg">Add Item</button>
                        <button type="button" onClick={() => setShowAddLine(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <button onClick={() => setShowAddLine(phase.id)}
                      className="text-xs text-blue-600 hover:underline">+ Add line item</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add phase form */}
      <div className="mt-4">
        {showAddPhase ? (
          <form onSubmit={addPhase} className="bg-white rounded-xl border p-4 space-y-3">
            <h3 className="font-semibold text-sm text-gray-800">New Phase / Category</h3>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Phase name" value={phaseForm.phase_name}
                onChange={e => setPhaseForm(f => ({ ...f, phase_name: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm" />
              <select value={phaseForm.category}
                onChange={e => setPhaseForm(f => ({ ...f, category: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input required placeholder="Allocated budget (₦)" value={phaseForm.allocated_display}
                onChange={e => setPhaseForm(f => ({ ...f, allocated_display: e.target.value }))}
                className="border rounded-lg px-3 py-2 text-sm" />
              <div className="flex items-center gap-2">
                <input placeholder="Contingency %" type="number" min="0" max="50" step="0.5"
                  value={phaseForm.contingency_pct}
                  onChange={e => setPhaseForm(f => ({ ...f, contingency_pct: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm flex-1" />
                <span className="text-xs text-gray-400">%</span>
              </div>
              <input placeholder="Description (optional)" value={phaseForm.description}
                onChange={e => setPhaseForm(f => ({ ...f, description: e.target.value }))}
                className="col-span-2 border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Add Phase</button>
              <button type="button" onClick={() => setShowAddPhase(false)} className="text-gray-500 px-3 py-2 text-sm">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAddPhase(true)}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
            + Add Phase / Category
          </button>
        )}
      </div>
    </div>
  )
}
