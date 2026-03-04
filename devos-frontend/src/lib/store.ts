import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Organisation {
  id: string
  name: string
  slug: string
  plan_tier: string
  timezone: string
  enabled_channels: string[]
}

interface AppState {
  organisation: Organisation | null
  setOrganisation: (org: Organisation | null) => void
  user: any | null
  setUser: (user: any | null) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      organisation: null,
      setOrganisation: (organisation) => set({ organisation }),
      user: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: 'devos-storage',
    }
  )
)