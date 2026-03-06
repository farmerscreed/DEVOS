import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * T4.8 — Developer Approval Interface
 * View purchase requests with GUARDIAN analysis flags.
 * Approve / Adjust / Reject with notes.
 * Flag severity colour-coding.
 */

interface PurchaseRequest {
  id: string
  description: string
  material_name: string
  quantity: number
  unit: string
  unit_rate_kobo: number
  supplier_name: string | null
  status: string
  guardian_flag: string | null
  guardian_analysis: GuardianAnalysis | null
  review_notes: string | null
  created_at: string
  project?: { name: string; location: string }
  phase?: { phase_name: string; category: string } | null
}

interface GuardianAnalysis {
  flag: string
  narrative: string
  price_analysis: {
    market_rate_kobo: number
    submitted_rate_kobo: number
    deviation_pct: number
    reference_material: string
    effective_date: string
  } | null
  budget_analysis: {
    phase_name: string
    allocated_kobo: number
    spent_kobo: number
    remaining_kobo: number
    total_cost_kobo: number
    would_breach: boolean
    utilisation_pct: number
  } | null
  auto_action: string | null
  analyzed_at: string
}

const FLAG_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  CLEAR:    { color: 'text-green-800', bg: 'bg-green-50 border-green-200',   label: 'CLEAR — Price OK, within budget' },
  INFO:     { color: 'text-blue-800',  bg: 'bg-blue-50 border-blue-200',     label: 'INFO — Minor price variance' },
  WARNING:  { color: 'text-yellow-800',bg: 'bg-yellow-50 border-yellow-200', label: 'WARNING — Significant deviation' },
  CRITICAL: { color: 'text-red-800',   bg: 'bg-red-50 border-red-200',       label: 'CRITICAL — Reject or investigate' },
}
const STATUS_COLORS: Record<string, string> = {
  pending:  'bg-gray-100 text-gray-600',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`
}

type FilterStatus = 'pending' | 'approved' | 'rejected' | 'all'

export default function DeveloperApprovals() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<PurchaseRequest | null>(null)
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending')
  const [filterFlag, setFilterFlag] = useState<string>('all')

  // Action form
  const [action, setAction] = useState<'approved' | 'adjusted' | 'rejected' | null>(null)
  const [notes, setNotes] = useState('')
  const [adjustedAmount, setAdjustedAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => { loadRequests() }, [filterStatus, filterFlag])

  async function loadRequests() {
    setLoading(true)
    let q = supabase
      .from('purchase_requests')
      .select(`
        id, description, material_name, quantity, unit,
        unit_rate_kobo, supplier_name, status, guardian_flag,
        guardian_analysis, review_notes, created_at,
        project:projects(name, location),
        phase:budget_phases(phase_name, category)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (filterStatus !== 'all') q = q.eq('status', filterStatus)
    if (filterFlag !== 'all') q = q.eq('guardian_flag', filterFlag)

    const { data } = await q
    setRequests((data as unknown as PurchaseRequest[]) || [])
    setLoading(false)
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !action) return
    setSubmitting(true)
    setSuccessMsg('')

    const { data: { session } } = await supabase.auth.getSession()
    const body: Record<string, unknown> = {
      purchase_request_id: selected.id,
      action,
      notes: notes || undefined,
    }
    if (action === 'adjusted' && adjustedAmount) {
      body.adjusted_amount_kobo = Math.round(parseFloat(adjustedAmount.replace(/,/g, '')) * 100)
    }

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/on-approval-granted`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setSubmitting(false)

    if (json.success) {
      setSuccessMsg(
        json.payment_ticket
          ? `${action.toUpperCase()} — Payment Ticket ${json.payment_ticket.reference_code} generated.`
          : `Request ${action}.`
      )
      setSelected(null)
      setAction(null)
      setNotes('')
      setAdjustedAmount('')
      loadRequests()
    } else {
      alert(json.error || 'Action failed')
    }
  }

  const flagCounts = requests.reduce((acc, r) => {
    if (r.guardian_flag) acc[r.guardian_flag] = (acc[r.guardian_flag] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left: list */}
      <div className="w-80 border-r bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold text-gray-900 mb-3">Purchase Approvals</h1>

          {/* Flag summary pills */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {Object.entries(FLAG_CONFIG).map(([flag, cfg]) => (
              flagCounts[flag] ? (
                <button
                  key={flag}
                  onClick={() => setFilterFlag(filterFlag === flag ? 'all' : flag)}
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color} ${filterFlag === flag ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
                >
                  {flag} {flagCounts[flag]}
                </button>
              ) : null
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1">
            {(['pending', 'approved', 'rejected', 'all'] as FilterStatus[]).map(s => (
              <button key={s}
                onClick={() => setFilterStatus(s)}
                className={`flex-1 text-xs py-1.5 rounded-lg capitalize ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && <p className="text-xs text-gray-400 p-4">Loading…</p>}
          {requests.map(pr => {
            const flagCfg = pr.guardian_flag ? FLAG_CONFIG[pr.guardian_flag] : null
            const total = pr.quantity * pr.unit_rate_kobo
            return (
              <div
                key={pr.id}
                onClick={() => { setSelected(pr); setAction(null); setNotes(''); setAdjustedAmount(''); setSuccessMsg('') }}
                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${selected?.id === pr.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {pr.material_name || pr.description}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium ${STATUS_COLORS[pr.status] || 'bg-gray-100 text-gray-500'}`}>
                    {pr.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{pr.description}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs font-semibold text-gray-800">{naira(total)}</span>
                  {flagCfg && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border font-semibold ${flagCfg.bg} ${flagCfg.color}`}>
                      {pr.guardian_flag}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(pr.created_at).toLocaleDateString()}</p>
              </div>
            )
          })}
          {!loading && requests.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No requests match filter.</p>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="flex-1 overflow-y-auto">
        {successMsg && (
          <div className="m-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
            {successMsg}
          </div>
        )}

        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a purchase request to review
          </div>
        ) : (
          <div className="p-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected.material_name || selected.description}</h2>
                <p className="text-sm text-gray-500">{selected.description}</p>
                {selected.project && (
                  <p className="text-xs text-gray-400 mt-1">
                    {(selected.project as unknown as { name: string }).name}
                    {selected.phase && ` — ${(selected.phase as unknown as { phase_name: string }).phase_name}`}
                  </p>
                )}
              </div>
              {selected.guardian_flag && (
                <div className={`text-sm font-semibold px-3 py-1 rounded-lg border ${FLAG_CONFIG[selected.guardian_flag]?.bg} ${FLAG_CONFIG[selected.guardian_flag]?.color}`}>
                  {FLAG_CONFIG[selected.guardian_flag]?.label}
                </div>
              )}
            </div>

            {/* Purchase details */}
            <div className="bg-white rounded-xl border p-4 mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Purchase Details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Quantity</p>
                  <p className="font-medium">{selected.quantity} {selected.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Unit Rate</p>
                  <p className="font-medium">{naira(selected.unit_rate_kobo)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="font-semibold text-lg">{naira(selected.quantity * selected.unit_rate_kobo)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Supplier</p>
                  <p className="font-medium">{selected.supplier_name || '—'}</p>
                </div>
              </div>
            </div>

            {/* GUARDIAN analysis */}
            {selected.guardian_analysis && (
              <div className={`rounded-xl border p-4 mb-4 ${FLAG_CONFIG[selected.guardian_flag || 'INFO']?.bg || 'bg-gray-50'}`}>
                <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-gray-600">GUARDIAN Analysis</h3>
                <p className="text-sm text-gray-800 mb-3">{selected.guardian_analysis.narrative}</p>

                {selected.guardian_analysis.price_analysis && (
                  <div className="bg-white/70 rounded-lg p-3 mb-2 text-sm">
                    <p className="font-semibold text-xs text-gray-500 mb-2">Price Index Comparison</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-gray-400">Market Rate</p>
                        <p className="font-semibold">{naira(selected.guardian_analysis.price_analysis.market_rate_kobo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Submitted Rate</p>
                        <p className="font-semibold">{naira(selected.guardian_analysis.price_analysis.submitted_rate_kobo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Deviation</p>
                        <p className={`font-bold ${selected.guardian_analysis.price_analysis.deviation_pct > 15 ? 'text-red-700' : 'text-gray-800'}`}>
                          {selected.guardian_analysis.price_analysis.deviation_pct > 0 ? '+' : ''}
                          {selected.guardian_analysis.price_analysis.deviation_pct.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Reference: {selected.guardian_analysis.price_analysis.reference_material} ({selected.guardian_analysis.price_analysis.effective_date})
                    </p>
                  </div>
                )}

                {selected.guardian_analysis.budget_analysis && (
                  <div className="bg-white/70 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-xs text-gray-500 mb-2">Budget Impact — {selected.guardian_analysis.budget_analysis.phase_name}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-gray-400">Allocated</p>
                        <p className="font-semibold">{naira(selected.guardian_analysis.budget_analysis.allocated_kobo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Remaining</p>
                        <p className="font-semibold">{naira(selected.guardian_analysis.budget_analysis.remaining_kobo)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">This Request</p>
                        <p className="font-semibold">{naira(selected.guardian_analysis.budget_analysis.total_cost_kobo)}</p>
                      </div>
                    </div>
                    {selected.guardian_analysis.budget_analysis.would_breach && (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        BUDGET BREACH: This purchase would exceed the phase ceiling ({selected.guardian_analysis.budget_analysis.utilisation_pct}% utilisation).
                      </p>
                    )}
                  </div>
                )}

                {selected.guardian_analysis.auto_action && (
                  <p className="text-xs text-gray-500 mt-2">
                    Auto-action taken: <strong>{selected.guardian_analysis.auto_action}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Action panel — only for pending requests */}
            {selected.status === 'pending' && (
              <div className="bg-white rounded-xl border p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Developer Decision</h3>

                {/* Action buttons */}
                <div className="flex gap-2 mb-4">
                  {(['approved', 'adjusted', 'rejected'] as const).map(a => (
                    <button
                      key={a}
                      onClick={() => setAction(a)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        action === a
                          ? a === 'approved' ? 'bg-green-600 text-white border-green-600'
                          : a === 'rejected' ? 'bg-red-600 text-white border-red-600'
                          : 'bg-yellow-500 text-white border-yellow-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {a === 'approved' ? 'Approve' : a === 'adjusted' ? 'Adjust' : 'Reject'}
                    </button>
                  ))}
                </div>

                {action && (
                  <form onSubmit={submitAction} className="space-y-3">
                    {action === 'adjusted' && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Adjusted Amount (₦)</label>
                        <input
                          placeholder="Enter approved amount in Naira"
                          value={adjustedAmount}
                          onChange={e => setAdjustedAmount(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Notes {action === 'rejected' ? '(required)' : '(optional)'}
                      </label>
                      <textarea
                        rows={3}
                        required={action === 'rejected'}
                        placeholder={action === 'rejected' ? 'Reason for rejection…' : 'Add notes…'}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 ${
                        action === 'approved' ? 'bg-green-600'
                        : action === 'rejected' ? 'bg-red-600'
                        : 'bg-yellow-500'
                      }`}
                    >
                      {submitting ? 'Processing…' : `Confirm ${action.charAt(0).toUpperCase() + action.slice(1)}`}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Already actioned */}
            {selected.status !== 'pending' && (
              <div className="bg-white rounded-xl border p-4 text-sm text-gray-500">
                This request was <strong className="text-gray-800">{selected.status}</strong>.
                {selected.review_notes && <p className="mt-1">Notes: {selected.review_notes}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
