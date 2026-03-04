import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../lib/store'

export interface Organisation {
  id: string
  name: string
  slug: string
  plan_tier: string
  timezone: string
  enabled_channels: string[]
  created_at: string
}

export function useOrganisationFromSubdomain() {
  const [organisation, setOrganisation] = useState<Organisation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const setOrgInStore = useAppStore((state) => state.setOrganisation)

  useEffect(() => {
    async function fetchOrganisation() {
      try {
        // Get subdomain from hostname
        const hostname = window.location.hostname
        console.log('Current hostname:', hostname)

        // Handle localhost or no subdomain
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          // For localhost, use a default org or query param
          const params = new URLSearchParams(window.location.search)
          const slug = params.get('org') || 'primerose'

          const { data, error } = await supabase
            .from('organisations')
            .select('*')
            .eq('slug', slug)
            .single()

          if (error) throw error
          setOrganisation(data)
          setOrgInStore(data)
          return
        }

        // Extract subdomain (e.g., "primerose" from "primerose.devos.app")
        const parts = hostname.split('.')
        let slug = parts[0]

        // If on vercel.app or localhost, handle accordingly
        if (parts.length >= 2 && parts[parts.length - 2] === 'vercel') {
          slug = parts[0] // This would be preview deployment
        }

        // For devos.app subdomains
        if (parts.length >= 3 && parts[parts.length - 2] === 'devos') {
          slug = parts[0]
        }

        console.log('Looking for org with slug:', slug)

        const { data, error } = await supabase
          .from('organisations')
          .select('*')
          .eq('slug', slug)
          .single()

        if (error) {
          // If not found by subdomain, try to find any org
          console.log('Org not found by slug, trying first org')
          const { data: fallbackData } = await supabase
            .from('organisations')
            .select('*')
            .limit(1)
            .single()

          if (fallbackData) {
            setOrganisation(fallbackData)
            setOrgInStore(fallbackData)
          } else {
            throw error
          }
        } else {
          setOrganisation(data)
          setOrgInStore(data)
        }
      } catch (err: any) {
        console.error('Error fetching organisation:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchOrganisation()
  }, [])

  return { organisation, loading, error }
}