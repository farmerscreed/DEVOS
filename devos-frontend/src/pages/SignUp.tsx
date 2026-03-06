import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../lib/store'

export default function SignUp() {
    const navigate = useNavigate()
    const setOrganisation = useAppStore((s) => s.setOrganisation)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            // Step 1: Sign up the user
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name,
                    },
                },
            })

            if (signUpError) throw signUpError
            if (!authData.user) throw new Error('Signup failed')

            // Step 2: Get the organisation (default to Primerose)
            const { data: orgData, error: orgError } = await supabase
                .from('organisations')
                .select('*')
                .eq('slug', 'primerose')
                .single()

            if (orgError) throw orgError

            // Step 3: Add user to org_members
            const { error: memberError } = await supabase
                .from('org_members')
                .insert({
                    user_id: authData.user.id,
                    organisation_id: orgData.id,
                    role: 'org_admin',
                })

            if (memberError) {
                // If already a member, that's OK - continue
                console.log('Member error (may already exist):', memberError)
            }

            // Step 4: Set organisation in store
            setOrganisation(orgData)

            // Step 5: Navigate to dashboard
            navigate('/dashboard')
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Signup failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Create Account</h1>
                <p className="text-gray-600 mb-6 text-sm text-center">Sign up to access the sales command centre</p>

                <form onSubmit={handleSignUp} className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="you@example.com"
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
                            minLength={6}
                        />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60"
                    >
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>
                </form>

                <div className="text-center">
                    <span className="text-gray-500 text-sm">Already have an account? </span>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="text-blue-600 hover:underline text-sm font-medium"
                    >
                        Sign In
                    </button>
                </div>
            </div>
        </div>
    )
}
