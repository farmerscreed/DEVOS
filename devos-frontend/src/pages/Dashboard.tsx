import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAppStore } from '../lib/store'

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
}

// ---- Lead List ----
function LeadList() {
    const org = useAppStore((s) => s.organisation)
    const [leads, setLeads] = useState<Lead[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('all')

    useEffect(() => {
        if (!org) return
        async function fetchLeads() {
            const query = supabase
                .from('leads')
                .select('id, name, phone, email, city, score, category, status, created_at')
                .order('score', { ascending: false })
                .limit(50)
            if (filter !== 'all') query.eq('category', filter)
            const { data } = await query
            setLeads(data || [])
            setLoading(false)
        }
        fetchLeads()
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
                        <div key={lead.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between hover:shadow-sm transition-shadow">
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

// ---- KPI Cards ----
function Overview() {
    const org = useAppStore((s) => s.organisation)
    const [stats, setStats] = useState({ total: 0, hot: 0, warm: 0, cold: 0 })

    useEffect(() => {
        if (!org) return
        async function fetchStats() {
            const { data } = await supabase
                .from('leads')
                .select('category')
            if (data) {
                const total = data.length
                const hot = data.filter((l) => l.category === 'hot').length
                const warm = data.filter((l) => l.category === 'warm').length
                const cold = data.filter((l) => l.category === 'cold').length
                setStats({ total, hot, warm, cold })
            }
        }
        fetchStats()
    }, [org])

    const kpis = [
        { label: 'Total Leads', value: stats.total, color: 'bg-blue-50 text-blue-700' },
        { label: 'Hot Leads 🔥', value: stats.hot, color: 'bg-red-50 text-red-700' },
        { label: 'Warm Leads', value: stats.warm, color: 'bg-yellow-50 text-yellow-700' },
        { label: 'Cold Leads', value: stats.cold, color: 'bg-gray-50 text-gray-600' },
    ]

    return (
        <div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">Command Overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {kpis.map((k) => (
                    <div key={k.label} className={`rounded-xl p-5 ${k.color}`}>
                        <p className="text-3xl font-bold">{k.value}</p>
                        <p className="text-sm mt-1 font-medium">{k.label}</p>
                    </div>
                ))}
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                <p className="font-semibold text-blue-900 mb-1">🚀 Getting started</p>
                <ul className="space-y-1 text-sm text-blue-700">
                    <li>✅ Project created</li>
                    <li>✅ Landing page live</li>
                    <li className="text-blue-400">⬜ First campaign running</li>
                    <li className="text-blue-400">⬜ First lead qualified</li>
                    <li className="text-blue-400">⬜ First reservation made</li>
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

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">DEVOS Dashboard</h1>
                    <p className="text-gray-600 mb-6 text-sm">Sign in to access the sales command centre</p>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Sidebar */}
            <div className="flex">
                <aside className="w-56 min-h-screen bg-white border-r border-gray-100 fixed left-0 top-0">
                    <div className="p-5 border-b border-gray-100">
                        <p className="font-bold text-gray-900">{org?.name || 'DEVOS'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                    </div>
                    <nav className="p-3 space-y-1">
                        {[
                            { path: '/dashboard', label: '📊 Overview' },
                            { path: '/dashboard/leads', label: '👥 Leads' },
                        ].map((item) => (
                            <Link key={item.path} to={item.path}
                                className="block px-3 py-2 text-sm rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="absolute bottom-4 left-0 right-0 px-3">
                        <button onClick={signOut}
                            className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors">
                            Sign Out
                        </button>
                    </div>
                </aside>

                {/* Content */}
                <main className="ml-56 flex-1 p-8">
                    <Routes>
                        <Route path="/" element={<Overview />} />
                        <Route path="/leads" element={<LeadList />} />
                    </Routes>
                </main>
            </div>
        </div>
    )
}
