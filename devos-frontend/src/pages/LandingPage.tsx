import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Organisation } from '../hooks/useOrganisation'

interface LandingPageProps {
    organisation: Organisation
}

const UNIT_TYPES = [
    { type: '1-Bed Studio', size: '45m²', price: '₦18,000,000', available: 12 },
    { type: '2-Bed Apartment', size: '75m²', price: '₦28,500,000', available: 8 },
    { type: '3-Bed Apartment', size: '110m²', price: '₦42,000,000', available: 5 },
    { type: '4-Bed Terrace', size: '160m²', price: '₦65,000,000', available: 3 },
]

export default function LandingPage({ organisation }: LandingPageProps) {
    const navigate = useNavigate()
    const [monthlyBudget, setMonthlyBudget] = useState(500000)

    return (
        <div className="min-h-screen bg-white">
            {/* Nav */}
            <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
                    <span className="text-xl font-bold text-gray-900">{organisation.name}</span>
                    <button
                        onClick={() => navigate('/lead')}
                        className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        Register Interest
                    </button>
                </div>
            </nav>

            {/* Hero */}
            <section className="pt-24 pb-16 bg-gradient-to-br from-blue-50 to-indigo-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                        Live Smarter at<br />
                        <span className="text-blue-600">{organisation.name}</span>
                    </h1>
                    <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                        Premium smart city living in the heart of Nigeria. Flexible payment plans. Modern amenities. Investment-grade properties.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                            onClick={() => navigate('/lead')}
                            className="bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
                        >
                            Register Interest Now
                        </button>
                        <a
                            href="#units"
                            className="bg-white text-blue-600 px-8 py-4 rounded-xl text-lg font-semibold border-2 border-blue-600 hover:bg-blue-50 transition-colors"
                        >
                            View Units
                        </a>
                    </div>
                    <p className="mt-4 text-sm text-gray-500">🔒 No commitment required · Free consultation via WhatsApp</p>
                </div>
            </section>

            {/* Stats */}
            <section className="py-10 bg-blue-600">
                <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center text-white">
                    {[
                        { label: 'Total Units', value: '320' },
                        { label: 'Units Available', value: '28' },
                        { label: 'Payment Plans', value: 'Up to 5yr' },
                        { label: 'Est. Completion', value: 'Q4 2026' },
                    ].map((s) => (
                        <div key={s.label}>
                            <p className="text-3xl font-bold">{s.value}</p>
                            <p className="text-blue-200 text-sm mt-1">{s.label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Units */}
            <section id="units" className="py-20 bg-gray-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Available Units</h2>
                    <p className="text-gray-600 text-center mb-12">All units include 24/7 security, smart home technology, and residents' gym</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {UNIT_TYPES.map((unit) => (
                            <div key={unit.type} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                                <div className="h-40 bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center">
                                    <span className="text-4xl">🏠</span>
                                </div>
                                <div className="p-5">
                                    <h3 className="font-bold text-gray-900 text-lg">{unit.type}</h3>
                                    <p className="text-gray-500 text-sm mb-3">{unit.size}</p>
                                    <p className="text-blue-600 font-bold text-xl mb-1">{unit.price}</p>
                                    <p className="text-green-600 text-sm font-medium mb-4">{unit.available} units left</p>
                                    <button
                                        onClick={() => navigate('/lead')}
                                        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                    >
                                        Enquire Now
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Payment Calculator */}
            <section className="py-20 bg-white">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center">Payment Calculator</h2>
                    <p className="text-gray-600 text-center mb-10">See what monthly payment fits your budget</p>
                    <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Monthly budget: <span className="text-blue-600 font-bold">₦{monthlyBudget.toLocaleString()}</span>
                        </label>
                        <input
                            type="range"
                            min={200000}
                            max={2000000}
                            step={50000}
                            value={monthlyBudget}
                            onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                            className="w-full accent-blue-600 mb-6"
                        />
                        <div className="grid grid-cols-2 gap-4">
                            {[{ label: '24-Month Plan', rate: 24 }, { label: '36-Month Plan', rate: 36 }, { label: '48-Month Plan', rate: 48 }, { label: '60-Month Plan', rate: 60 }].map(({ label, rate }) => {
                                const totalAffordable = monthlyBudget * rate
                                const matchingUnits = UNIT_TYPES.filter(u => {
                                    const price = parseInt(u.price.replace(/[₦,]/g, ''))
                                    return price <= totalAffordable * 1.1
                                })
                                return (
                                    <div key={rate} className={`rounded-xl p-4 border-2 ${matchingUnits.length > 0 ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
                                        <p className="font-semibold text-gray-900 text-sm">{label}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {matchingUnits.length > 0 ? `✅ ${matchingUnits.length} unit type(s) match` : '❌ Budget too low'}
                                        </p>
                                        <p className="text-blue-600 font-bold mt-2">₦{(monthlyBudget * rate).toLocaleString()}</p>
                                        <p className="text-xs text-gray-400">total purchase power</p>
                                    </div>
                                )
                            })}
                        </div>
                        <button
                            onClick={() => navigate('/lead')}
                            className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Get My Personalised Quote
                        </button>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-16 bg-blue-600 text-white text-center">
                <div className="max-w-2xl mx-auto px-4">
                    <h2 className="text-3xl font-bold mb-4">Ready to secure your unit?</h2>
                    <p className="text-blue-100 mb-8">Register today. Our team will reach out via WhatsApp within minutes.</p>
                    <button
                        onClick={() => navigate('/lead')}
                        className="bg-white text-blue-600 px-10 py-4 rounded-xl text-lg font-bold hover:bg-blue-50 transition-colors"
                    >
                        Register Interest →
                    </button>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-8 bg-gray-900 text-center text-gray-400 text-sm">
                <p>© {new Date().getFullYear()} {organisation.name}. All rights reserved.</p>
                <p className="mt-1">Powered by DEVOS · {organisation.slug}.devos.app</p>
            </footer>
        </div>
    )
}
