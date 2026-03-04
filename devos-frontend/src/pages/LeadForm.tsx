import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Organisation } from '../hooks/useOrganisation'

interface LeadFormProps {
    organisation: Organisation
}

interface FormData {
    name: string
    phone: string
    email: string
    city: string
    country: string
    budget_min: string
    budget_max: string
    investment_type: string
    unit_interest: string
}

const UNIT_OPTIONS = ['1-Bed Studio', '2-Bed Apartment', '3-Bed Apartment', '4-Bed Terrace', 'Any']
const INVESTMENT_OPTIONS = ['Owner-occupier', 'Buy-to-let', 'Flip / resale', 'Not sure yet']

export default function LeadForm({ organisation }: LeadFormProps) {
    const navigate = useNavigate()
    const [form, setForm] = useState<FormData>({
        name: '', phone: '', email: '', city: '', country: 'Nigeria',
        budget_min: '', budget_max: '', investment_type: '', unit_interest: '',
    })
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        setError(null)

        try {
            // Parse UTM params from URL
            const params = new URLSearchParams(window.location.search)
            const utm = {
                utm_source: params.get('utm_source') || null,
                utm_medium: params.get('utm_medium') || null,
                utm_campaign: params.get('utm_campaign') || null,
                utm_content: params.get('utm_content') || null,
            }

            // Get a simple rule-based score
            let score = 30
            if (form.budget_min && parseInt(form.budget_min) >= 18000000) score += 20
            if (form.investment_type === 'Owner-occupier') score += 15
            if (form.investment_type === 'Buy-to-let') score += 10
            if (form.city.toLowerCase().includes('lagos') || form.city.toLowerCase().includes('abuja')) score += 10
            if (form.unit_interest && form.unit_interest !== 'Any') score += 5

            const category = score >= 70 ? 'hot' : score >= 50 ? 'warm' : 'cold'

            const { error: insertError } = await supabase.from('leads').insert({
                organisation_id: organisation.id,
                name: form.name,
                phone: form.phone,
                email: form.email || null,
                city: form.city || null,
                country: form.country,
                budget_min_kobo: form.budget_min ? parseInt(form.budget_min) * 100 : null,
                budget_max_kobo: form.budget_max ? parseInt(form.budget_max) * 100 : null,
                investment_type: form.investment_type || null,
                unit_interest: form.unit_interest || null,
                score,
                category,
                status: 'new',
                preferred_channel: 'whatsapp',
                ...utm,
            })

            if (insertError) throw insertError

            setSubmitted(true)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
        } finally {
            setSubmitting(false)
        }
    }

    if (submitted) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">✅</span>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">You're registered!</h2>
                    <p className="text-gray-600 mb-6">
                        Our consultant will reach out via WhatsApp within the next few minutes. Please keep your phone handy.
                    </p>
                    <button onClick={() => navigate('/')} className="text-blue-600 hover:underline text-sm">
                        ← Back to {organisation.name}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4">
            <div className="max-w-lg mx-auto">
                <div className="mb-8">
                    <button onClick={() => navigate('/')} className="text-blue-600 hover:underline text-sm mb-4 block">
                        ← Back to {organisation.name}
                    </button>
                    <h1 className="text-3xl font-bold text-gray-900">Register Your Interest</h1>
                    <p className="text-gray-600 mt-2">Complete this form and we'll reach out via WhatsApp to help you find the perfect unit.</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                            <input name="name" value={form.name} onChange={handleChange} required placeholder="Amara Okafor"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone (WhatsApp) *</label>
                            <input name="phone" value={form.phone} onChange={handleChange} required placeholder="+234 801 000 0000" type="tel"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                            <input name="email" value={form.email} onChange={handleChange} placeholder="amara@email.com" type="email"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                            <input name="city" value={form.city} onChange={handleChange} required placeholder="Lagos"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                            <select name="country" value={form.country} onChange={handleChange}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option>Nigeria</option>
                                <option>United Kingdom</option>
                                <option>United States</option>
                                <option>Canada</option>
                                <option>Germany</option>
                                <option>Other</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Min Budget (₦)</label>
                            <input name="budget_min" value={form.budget_min} onChange={handleChange} placeholder="18000000" type="number"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Budget (₦)</label>
                            <input name="budget_max" value={form.budget_max} onChange={handleChange} placeholder="65000000" type="number"
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Investment Type *</label>
                            <select name="investment_type" value={form.investment_type} onChange={handleChange} required
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="">Select...</option>
                                {INVESTMENT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unit Interest</label>
                            <select name="unit_interest" value={form.unit_interest} onChange={handleChange}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
                                <option value="">Select...</option>
                                {UNIT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>

                    {error && (
                        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <button type="submit" disabled={submitting}
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                        {submitting ? 'Submitting...' : 'Register My Interest →'}
                    </button>

                    <p className="text-xs text-center text-gray-400">
                        By submitting, you agree to be contacted via WhatsApp. We will never share your details.
                    </p>
                </form>
            </div>
        </div>
    )
}
