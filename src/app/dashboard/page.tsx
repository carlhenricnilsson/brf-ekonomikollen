'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import Link from 'next/link'

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email ?? '')
      setLoading(false)
    }
    checkAuth()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-white/40">Laddar...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold">Ekonomi<span className="text-blue-400">kollen</span></span>
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm">{userEmail}</span>
          <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">
            Logga ut
          </button>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Välkommen till Ekonomikollen</h1>
        <p className="text-white/50 mb-8">Starta en ny enkät eller se era tidigare resultat.</p>
        <Link href="/survey"
          className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-8 py-3 rounded-xl transition-colors inline-block">
          Starta ny enkät →
        </Link>
      </div>
    </div>
  )
}
