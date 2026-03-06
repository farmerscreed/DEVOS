import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAppStore } from '../lib/store'
import { UnitInventory } from './UnitInventory'
import { FinanceView } from './FinanceView'
import BudgetManager from './BudgetManager'
import DeveloperApprovals from './DeveloperApprovals'

// Types
interface Lead {
    id: string
    name: string
    phone: string
    email: string | null
    city: string | null
    score: number
    category: string
    status: string
    created_at: string
    conversation_state?: string
    qualification_data?: Record<string, any>
    preferred_channel?: string
}

interface MessageThread {
    id: string
    content: string
    direction: string
    channel: string
    created_at: string
    is_agent_message?: boolean
}

// ---- Lead List ----
function LeadList() {
    const org = useAppStore((s) => s.organisation)
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('all')
    const navigate = useNavigate()

    useEffect(() => {
        if (!org) return
        const orgId = org.id
        async function fetchLeads() {
            const query = supabase
                .from('leads')
                .select('id, name, phone, email, city, score, category, status, created_at')
                .eq('organisation_id', orgId)
                .order('score', { ascending: false })
                .limit(50)
            if (filter !== 'all') query.eq('category', filter)
            const { data } = await query
            setLeads(data || [])
            setLoading(false)
        }
        fetchLeads()

        // Subscribe to real-time updates
        const channel = supabase
            .channel('leads-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'leads',
                filter: `organisation_id=eq.${orgId}`
            }, () => {
                fetchLeads()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [org, filter])

    const categoryColor: Record<string, string> = {
        hot: 'bg-red-100 text-red-700',
        warm: 'bg-yellow-100 text-yellow-700',
        cold: 'bg-blue-100 text-blue-700',
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Leads</h2>
                <div className="flex gap-2">
                    {['all', 'hot', 'warm', 'cold'].map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-3 py-1 rounded-full text-sm font-medium capitalize transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : leads.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-3">📋</p>
                    <p className="font-medium">No leads yet</p>
                    <p className="text-sm mt-1">Share your landing page to start collecting leads</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {leads.map((lead) => (
                        <div key={lead.id}
                            onClick={() => navigate(`/dashboard/leads/${lead.id}`)}
                            className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between hover:shadow-sm transition-shadow cursor-pointer">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600 text-sm">
                                    {lead.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-900">{lead.name}</p>
                                    <p className="text-sm text-gray-500">{lead.phone}{lead.city ? ` · ${lead.city}` : ''}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-sm font-bold text-gray-900">{lead.score}/100</p>
                                    <p className="text-xs text-gray-400">{lead.status}</p>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${categoryColor[lead.category] || 'bg-gray-100 text-gray-600'}`}>
                                    {lead.category}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ---- Lead Detail ----
function LeadDetail() {
    const { leadId } = useParams()
    const org = useAppStore((s) => s.organisation)
    const [lead, setLead] = useState<Lead | null>(null)
    const [messages, setMessages] = useState<MessageThread[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!org || !leadId) return
        const orgId = org.id

        async function fetchLeadAndMessages() {
            const { data: leadData } = await supabase
                .from('leads')
                .select('*')
                .eq('id', leadId)
                .eq('organisation_id', orgId)
                .single()
            setLead(leadData)

            const { data: msgData } = await supabase
                .from('message_threads')
                .select('*')
                .eq('lead_id', leadId)
                .order('created_at', { ascending: true })
            setMessages(msgData || [])
            setLoading(false)
        }

        fetchLeadAndMessages()

        // Subscribe to new messages
        const channel = supabase
            .channel(`lead-${leadId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'message_threads',
                filter: `lead_id=eq.${leadId}`
            }, (payload: any) => {
                setMessages(prev => [...prev, payload.new as MessageThread])
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [org, leadId])

    if (loading) {
        return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
    }

    if (!lead) {
        return <div className="text-center py-12 text-gray-400">Lead not found</div>
    }

    const categoryColor: Record<string, string> = {
        hot: 'bg-red-100 text-red-700',
        warm: 'bg-yellow-100 text-yellow-700',
        cold: 'bg-blue-100 text-blue-700',
    }

    return (
        <div>
            <div className="flex items-center gap-4 mb-6">
                <Link to="/dashboard/leads" className="text-blue-600 hover:underline">← Back to Leads</Link>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{lead.name}</h2>
                        <p className="text-gray-500 mt-1">{lead.phone} · {lead.email}</p>
                        <p className="text-gray-500">{lead.city || 'No location'}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-4xl font-bold text-gray-900">{lead.score}/100</p>
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-2 ${categoryColor[lead.category] || 'bg-gray-100 text-gray-600'}`}>
                            {lead.category}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
                    <div>
                        <p className="text-xs text-gray-400 uppercase">Status</p>
                        <p className="font-medium">{lead.status}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase">Conversation State</p>
                        <p className="font-medium">{lead.conversation_state || 'intake'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase">Channel</p>
                        <p className="font-medium">{lead.preferred_channel || 'telegram'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase">Created</p>
                        <p className="font-medium">{new Date(lead.created_at).toLocaleDateString()}</p>
                    </div>
                </div>

                {lead.qualification_data && Object.keys(lead.qualification_data).length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-100">
                        <h3 className="font-semibold mb-3">Qualification Data</h3>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(lead.qualification_data).map(([key, value]) => (
                                <span key={key} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                                    {key}: {String(value)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h3 className="font-semibold mb-4">Conversation History</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                    {messages.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">No messages yet</p>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${msg.direction === 'inbound'
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'bg-blue-600 text-white'
                                    }`}>
                                    <p className="text-sm">{msg.content}</p>
                                    <p className={`text-xs mt-1 ${msg.direction === 'inbound' ? 'text-gray-400' : 'text-blue-200'}`}>
                                        {new Date(msg.created_at).toLocaleTimeString()} · {msg.channel}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

// ---- Agent Logs ----
function AgentLogs() {
    const org = useAppStore((s) => s.organisation)
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [agentFilter, setAgentFilter] = useState<string>('all')
    const [dateFilter, setDateFilter] = useState<string>('all')
    const [page, setPage] = useState(1)
    const pageSize = 20

    useEffect(() => {
        if (!org) return
        const orgId = org.id
        async function fetchLogs() {
            let query = supabase
                .from('agent_logs')
                .select('*')
                .eq('organisation_id', orgId)
                .order('created_at', { ascending: false })
                .range((page - 1) * pageSize, page * pageSize - 1)

            if (agentFilter !== 'all') query = query.eq('agent_type', agentFilter)
            if (dateFilter !== 'all') {
                const date = new Date()
                if (dateFilter === 'today') date.setHours(0, 0, 0, 0)
                else if (dateFilter === 'week') date.setDate(date.getDate() - 7)
                else if (dateFilter === 'month') date.setMonth(date.getMonth() - 1)
                query = query.gte('created_at', date.toISOString())
            }

            const { data } = await query
            setLogs(data || [])
            setLoading(false)
        }
        fetchLogs()
    }, [org, agentFilter, dateFilter, page])

    const statusColor: Record<string, string> = {
        completed: 'bg-green-100 text-green-700',
        running: 'bg-blue-100 text-blue-700',
        failed: 'bg-red-100 text-red-700',
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Agent Logs</h2>
                <div className="flex gap-4">
                    <select
                        value={agentFilter}
                        onChange={(e) => setAgentFilter(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="all">All Agents</option>
                        <option value="presell">PRESELL</option>
                        <option value="master">MASTER</option>
                        <option value="guardian">Guardian</option>
                        <option value="adengine">Ad Engine</option>
                    </select>
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : logs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <p className="text-4xl mb-3">📝</p>
                    <p className="font-medium">No agent logs yet</p>
                    <p className="text-sm mt-1">Agent activity will appear here</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                            <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Agent</th>
                                <th className="px-4 py-3">Model</th>
                                <th className="px-4 py-3">Input</th>
                                <th className="px-4 py-3">Output</th>
                                <th className="px-4 py-3">Tokens</th>
                                <th className="px-4 py-3">Cost</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {logs.map((log) => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                        {new Date(log.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-sm font-medium">{log.agent_type}</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {log.model_used || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate">
                                        {log.input_summary || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[150px] truncate">
                                        {log.output_summary || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        {(log.input_tokens || 0) + (log.output_tokens || 0)}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        ${log.cost_usd?.toFixed(4) || '0.0000'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor[log.status] || 'bg-gray-100 text-gray-600'}`}>
                                            {log.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {logs.length > 0 && (
                <div className="flex justify-center gap-2 mt-4">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={logs.length < pageSize}
                        className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    )
}

// ---- KPI Cards ----
function Overview() {
    const org = useAppStore((s) => s.organisation)
    const [stats, setStats] = useState({
        totalLeads: 0, hot: 0, warm: 0, cold: 0,
        available: 0, reserved: 0, sold: 0,
        confirmedPaymentsKobo: 0, pendingPayments: 0,
    })
    const [checklistItems, setChecklistItems] = useState({
        hasLeads: false,
        hasReservation: false,
        hasPayment: false,
    })

    useEffect(() => {
        if (!org) return
        const orgId = org.id

        async function fetchStats() {
            const [leadsRes, unitsRes, paymentsRes] = await Promise.all([
                supabase.from('leads').select('category').eq('organisation_id', orgId),
                supabase.from('units').select('status').eq('organisation_id', orgId),
                supabase.from('payments_in').select('amount_kobo, status').eq('organisation_id', orgId),
            ])

            const leads = leadsRes.data || []
            const units = unitsRes.data || []
            const payments = paymentsRes.data || []

            const totalLeads = leads.length
            const hot = leads.filter((l: any) => l.category === 'hot').length
            const warm = leads.filter((l: any) => l.category === 'warm').length
            const cold = leads.filter((l: any) => l.category === 'cold').length

            const available = units.filter((u: any) => u.status === 'available').length
            const reserved = units.filter((u: any) => u.status === 'reserved').length
            const sold = units.filter((u: any) => u.status === 'sold').length

            const confirmed = payments.filter((p: any) => p.status === 'confirmed')
            const confirmedPaymentsKobo = confirmed.reduce((sum: number, p: any) => sum + (p.amount_kobo || 0), 0)
            const pendingPayments = payments.filter((p: any) => p.status === 'pending').length

            setStats({ totalLeads, hot, warm, cold, available, reserved, sold, confirmedPaymentsKobo, pendingPayments })
            setChecklistItems({
                hasLeads: totalLeads > 0,
                hasReservation: reserved + sold > 0,
                hasPayment: confirmed.length > 0,
            })
        }
        fetchStats()
    }, [org])

    const revenueNGN = (stats.confirmedPaymentsKobo / 100).toLocaleString('en-NG', { notation: 'compact', maximumFractionDigits: 1 })

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Command Overview</h2>
                <p className="text-sm text-zinc-400 mt-1">Sales performance at a glance</p>
            </div>

            {/* Lead KPIs */}
            <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-semibold">Leads</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <p className="text-3xl font-bold text-white">{stats.totalLeads}</p>
                        <p className="text-sm text-zinc-400 mt-1">Total Leads</p>
                    </div>
                    <div className="bg-red-950/30 border border-red-500/20 rounded-xl p-4">
                        <p className="text-3xl font-bold text-red-300">{stats.hot}</p>
                        <p className="text-sm text-red-400 mt-1">🔥 Hot</p>
                    </div>
                    <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4">
                        <p className="text-3xl font-bold text-amber-300">{stats.warm}</p>
                        <p className="text-sm text-amber-400 mt-1">Warm</p>
                    </div>
                    <div className="bg-zinc-800/60 border border-zinc-700/30 rounded-xl p-4">
                        <p className="text-3xl font-bold text-zinc-400">{stats.cold}</p>
                        <p className="text-sm text-zinc-500 mt-1">Cold</p>
                    </div>
                </div>
            </div>

            {/* Units + Revenue KPIs */}
            <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-semibold">Inventory &amp; Revenue</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4">
                        <p className="text-3xl font-bold text-emerald-300">{stats.available}</p>
                        <p className="text-sm text-emerald-400 mt-1">Available</p>
                    </div>
                    <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-4">
                        <p className="text-3xl font-bold text-amber-300">{stats.reserved}</p>
                        <p className="text-sm text-amber-400 mt-1">Reserved</p>
                    </div>
                    <div className="bg-purple-950/30 border border-purple-500/20 rounded-xl p-4">
                        <p className="text-3xl font-bold text-purple-300">{stats.sold}</p>
                        <p className="text-sm text-purple-400 mt-1">Sold</p>
                    </div>
                    <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-4">
                        <p className="text-2xl font-bold text-blue-300">₦{revenueNGN}</p>
                        <p className="text-sm text-blue-400 mt-1">Revenue confirmed</p>
                        {stats.pendingPayments > 0 && (
                            <p className="text-xs text-amber-400 mt-1">{stats.pendingPayments} pending review</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Setup checklist */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
                <p className="font-semibold text-white mb-3">🚀 Getting started</p>
                <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2 text-emerald-400">✅ <span>Project created</span></li>
                    <li className="flex items-center gap-2 text-emerald-400">✅ <span>Landing page live</span></li>
                    <li className={`flex items-center gap-2 ${checklistItems.hasLeads ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {checklistItems.hasLeads ? '✅' : '⬜'} <span>First lead qualified</span>
                    </li>
                    <li className={`flex items-center gap-2 ${checklistItems.hasReservation ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {checklistItems.hasReservation ? '✅' : '⬜'} <span>First reservation made</span>
                    </li>
                    <li className={`flex items-center gap-2 ${checklistItems.hasPayment ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {checklistItems.hasPayment ? '✅' : '⬜'} <span>First payment confirmed</span>
                    </li>
                </ul>
            </div>
        </div>
    )
}

// ---- Main Dashboard ----
export default function Dashboard() {
    const navigate = useNavigate()
    const { user, loading, signOut } = useAuth()
    const org = useAppStore((s) => s.organisation)

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [authError, setAuthError] = useState<string | null>(null)
    const [isSigningIn, setIsSigningIn] = useState(false)

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setAuthError(null)
        setIsSigningIn(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setAuthError(error.message)
        setIsSigningIn(false)
    }

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">DEVOS Dashboard</h1>
                    <p className="text-gray-600 mb-6 text-sm text-center">Sign in to access the sales command centre</p>

                    <form onSubmit={handleSignIn} className="space-y-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="agent@devos.app"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="••••••••"
                            />
                        </div>
                        {authError && <p className="text-sm text-red-600">{authError}</p>}
                        <button
                            type="submit"
                            disabled={isSigningIn}
                            className="w-full bg-blue-600 text-white py-2 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60"
                        >
                            {isSigningIn ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>

                    <button
                        onClick={() => navigate('/')}
                        className="w-full text-blue-600 py-2 rounded-xl font-medium hover:bg-blue-50 text-sm"
                    >
                        ← Back to Home
                    </button>

                    <div className="text-center mt-4">
                        <span className="text-gray-500 text-sm">Don't have an account? </span>
                        <button
                            onClick={() => navigate('/signup')}
                            className="text-blue-600 hover:underline text-sm font-medium"
                        >
                            Sign Up
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Sidebar */}
            <div className="flex">
                <aside className="w-56 min-h-screen bg-zinc-950 border-r border-zinc-800 fixed left-0 top-0">
                    <div className="p-5 border-b border-zinc-800">
                        <p className="font-bold text-white">{org?.name || 'DEVOS'}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{user.email}</p>
                    </div>
                    <nav className="p-3 space-y-4 overflow-y-auto">
                        {/* Command */}
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 mb-1">Command</p>
                            {[
                                { path: '/dashboard', label: '📊 Overview' },
                                { path: '/dashboard/logs', label: '🤖 Agent Logs' },
                            ].map(item => (
                                <Link key={item.path} to={item.path}
                                    className="block px-3 py-2 text-sm rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white font-medium transition-colors">
                                    {item.label}
                                </Link>
                            ))}
                        </div>

                        {/* PRESELL — Sales Pipeline */}
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 mb-1">PRESELL Agent</p>
                            {[
                                { path: '/dashboard/leads', label: '👥 Leads' },
                                { path: '/dashboard/units', label: '🏠 Unit Inventory' },
                            ].map(item => (
                                <Link key={item.path} to={item.path}
                                    className="block px-3 py-2 text-sm rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white font-medium transition-colors">
                                    {item.label}
                                </Link>
                            ))}
                        </div>

                        {/* GUARDIAN — Construction */}
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 mb-1">GUARDIAN Agent</p>
                            {[
                                { path: '/dashboard/budget', label: '🏗️ Budget Manager' },
                                { path: '/dashboard/approvals', label: '✅ Purchase Approvals' },
                            ].map(item => (
                                <Link key={item.path} to={item.path}
                                    className="block px-3 py-2 text-sm rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white font-medium transition-colors">
                                    {item.label}
                                </Link>
                            ))}
                        </div>

                        {/* Finance */}
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 mb-1">Finance</p>
                            {[
                                { path: '/dashboard/finance', label: '💳 Finance View' },
                            ].map(item => (
                                <Link key={item.path} to={item.path}
                                    className="block px-3 py-2 text-sm rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white font-medium transition-colors">
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </nav>
                    <div className="absolute bottom-4 left-0 right-0 px-3">
                        <button onClick={signOut}
                            className="w-full px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 rounded-lg font-medium transition-colors">
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Content */}
                <main className="ml-56 flex-1 p-8 min-h-screen bg-zinc-950">
                    <Routes>
                        <Route path="/" element={<Overview />} />
                        <Route path="/leads" element={<LeadList />} />
                        <Route path="/leads/:leadId" element={<LeadDetail />} />
                        <Route path="/units" element={<UnitInventory />} />
                        <Route path="/finance" element={<FinanceView />} />
                        <Route path="/budget" element={<BudgetManager />} />
                        <Route path="/approvals" element={<DeveloperApprovals />} />
                        <Route path="/logs" element={<AgentLogs />} />
                    </Routes>
                </main>
            </div>
        </div>
    )
}
