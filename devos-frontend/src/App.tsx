import { Routes, Route, Navigate } from 'react-router-dom'
import { useOrganisationFromSubdomain } from './hooks/useOrganisation'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import LeadForm from './pages/LeadForm'
import SignUp from './pages/SignUp'
import { BuyerPortal, BuyerLogin } from './pages/BuyerPortal'
import SiteManager from './pages/SiteManager'
import { useEffect } from 'react'

function App() {
  const { organisation, loading, error } = useOrganisationFromSubdomain()

  // Log organisation info for debugging
  useEffect(() => {
    console.log('Current organisation:', organisation)
    console.log('Loading:', loading)
    console.log('Error:', error)
  }, [organisation, loading, error])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      {/* Landing page for each organisation (subdomain) */}
      <Route path="/" element={
        organisation ? (
          <LandingPage organisation={organisation} />
        ) : (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Organisation Not Found</h1>
              <p className="text-gray-600">Please check the subdomain or contact support.</p>
            </div>
          </div>
        )
      } />

      {/* Lead form submission */}
      <Route path="/lead" element={
        organisation ? <LeadForm organisation={organisation} /> : <Navigate to="/" />
      } />

      {/* Dashboard routes */}
      <Route path="/dashboard/*" element={<Dashboard />} />

      {/* Buyer portal */}
      <Route path="/buyer/login" element={<BuyerLogin />} />
      <Route path="/buyer" element={<BuyerPortal />} />

      {/* Site Manager — mobile interface for site managers */}
      <Route path="/site" element={<SiteManager />} />

      {/* Sign up */}
      <Route path="/signup" element={<SignUp />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App