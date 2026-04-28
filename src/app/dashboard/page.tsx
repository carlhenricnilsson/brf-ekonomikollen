'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

type Survey = {
  id: string
  survey_year: number
  status: string
  brf_name: string | null
  token: string
  version: number | null
  created_at: string
  kpi_results: { kpi_number: number; value: number; traffic_light: string }[]
}

type Payment = {
  survey_id: string
  status: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [myBrfs, setMyBrfs] = useState<string[]>([])
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email ?? '')
      setUserId(user.id)

      // Hämta enkäter och betalningar via server-side route (kringgår RLS)
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        const res = await fetch('/api/my-surveys', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setMyBrfs(data.brfNames ?? [])
          setSurveys(data.surveys ?? [])
          setPayments(data.payments ?? [])
        }
      }
      setLoading(false)
    }
    init()
  }, [router])

  function isUnlocked(surveyId: string) {
    return payments.some(p => p.survey_id === surveyId)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const lightDot = (light: string) => {
    if (light === 'red') return 'bg-red-400'
    if (light === 'yellow') return 'bg-yellow-400'
    if (light === 'green') return 'bg-green-400'
    return 'bg-blue-400'
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-white/40">Laddar...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">BRF-Ekonomi<span className="text-blue-400">kollen</span></span>
          <span className="bg-blue-500/20 text-blue-300 text-xs font-medium px-2 py-0.5 rounded-full">BRF-admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm">{userEmail}</span>
          <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">
            Logga ut
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-2">Mina BRF:er</h1>
        <p className="text-white/40 text-sm mb-8">
          {myBrfs.length > 0
            ? `Du har tillgång till ${myBrfs.length} ${myBrfs.length === 1 ? 'förening' : 'föreningar'}: ${myBrfs.join(', ')}`
            : 'Du har inte kopplats till någon BRF ännu. Kontakta din administratör.'
          }
        </p>

        {myBrfs.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <p className="text-white/50 mb-4">Inga BRF:er kopplade till ditt konto.</p>
            <p className="text-white/30 text-sm">
              Be din administratör att bjuda in dig med din e-postadress ({userEmail}).
            </p>
          </div>
        ) : surveys.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <p className="text-white/50 mb-2">Inga genomförda undersökningar ännu.</p>
            <p className="text-white/30 text-sm">Resultat visas här när enkäter har fyllts i.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {surveys.map(survey => {
              const kpis = survey.kpi_results ?? []
              const unlocked = isUnlocked(survey.id)

              return (
                <div key={survey.id} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between hover:bg-white/[0.07] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-500/20 rounded-lg w-10 h-10 flex items-center justify-center text-blue-400 font-bold text-sm">
                      {survey.survey_year}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{survey.brf_name || `Enkät ${survey.survey_year}`}</p>
                        {unlocked && (
                          <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">Upplåst</span>
                        )}
                        {!unlocked && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">Begränsad</span>
                        )}
                      </div>
                      <p className="text-white/30 text-xs mt-0.5">
                        {new Date(survey.created_at).toLocaleDateString('sv-SE')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {kpis.length > 0 && (
                      <div className="flex items-center gap-2">
                        {[...Array(7)].map((_, i) => {
                          const kpi = kpis.find(k => k.kpi_number === i + 1)
                          return <div key={i} className={`w-2.5 h-2.5 rounded-full ${kpi ? lightDot(kpi.traffic_light) : 'bg-white/10'}`} />
                        })}
                      </div>
                    )}
                    <button
                      onClick={() => router.push(`/results/${survey.id}`)}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                    >
                      Visa rapport →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Starta ny enkät */}
        <div className="mt-12 bg-blue-500/5 border border-blue-500/20 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-bold mb-2">Starta ny undersökning</h2>
          <p className="text-white/40 text-sm mb-6">Fyll i er BRFs ekonomiska data och få nyckeltal och AI-analys.</p>
          <button
            onClick={() => router.push('/survey')}
            className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Starta enkät →
          </button>
        </div>
      </div>
    </div>
  )
}
