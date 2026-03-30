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

export default function AdminPage() {
  const router = useRouter()
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [showCreateLink, setShowCreateLink] = useState(false)
  const [newBrfName, setNewBrfName] = useState('')
  const [createdLink, setCreatedLink] = useState('')
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchYear, setSearchYear] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
    fetchSurveys()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserEmail(user.email ?? '')

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'superadmin') router.push('/dashboard')
  }

  async function fetchSurveys() {
    const { data } = await supabase
      .from('surveys')
      .select('*, kpi_results(*)')
      .order('created_at', { ascending: false })

    setSurveys(data ?? [])
    setLoading(false)
  }

  async function createSurveyLink() {
    setCreating(true)
    const res = await fetch('/api/create-survey-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brf_name: newBrfName, survey_year: new Date().getFullYear() }),
    })
    const data = await res.json()
    if (data.token) {
      const baseUrl = window.location.origin
      setCreatedLink(`${baseUrl}/survey?token=${data.token}`)
      fetchSurveys()
    }
    setCreating(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const filteredSurveys = surveys.filter(s => {
    const nameMatch = searchQuery === '' || (s.brf_name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    const yearMatch = searchYear === '' || String(s.survey_year) === searchYear
    return nameMatch && yearMatch
  })

  const availableYears = [...new Set(surveys.map(s => s.survey_year))].sort((a, b) => b - a)

  function copyLink(surveyId: string, token: string) {
    const link = `${window.location.origin}/survey?token=${token}`
    try {
      navigator.clipboard.writeText(link)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopiedId(surveyId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const lightDot = (light: string) => {
    if (light === 'red') return 'bg-red-400'
    if (light === 'yellow') return 'bg-yellow-400'
    if (light === 'green') return 'bg-green-400'
    return 'bg-blue-400'
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold">Ekonomi<span className="text-blue-400">kollen</span></span>
          <span className="bg-purple-500/20 text-purple-300 text-xs font-medium px-2 py-0.5 rounded-full">Superadmin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white/40 text-sm">{userEmail}</span>
          <button onClick={handleLogout} className="text-sm text-white/50 hover:text-white transition-colors">
            Logga ut
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Alla enkäter</h1>
            <p className="text-white/40 text-sm mt-1">{surveys.length} enkäter totalt</p>
          </div>
          <button
            onClick={() => { setShowCreateLink(true); setCreatedLink('') }}
            className="bg-blue-500 hover:bg-blue-400 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            + Skapa enkätlänk
          </button>
        </div>

        {/* Skapa länk-modal */}
        {showCreateLink && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8">
            <h2 className="font-bold text-lg mb-4">Skapa ny enkätlänk</h2>
            {!createdLink ? (
              <>
                <label className="block text-sm text-white/60 mb-2">BRF-namn (valfritt)</label>
                <input
                  type="text"
                  value={newBrfName}
                  onChange={e => setNewBrfName(e.target.value)}
                  placeholder="T.ex. BRF Solgläntan"
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-blue-400"
                />
                <div className="flex gap-3">
                  <button
                    onClick={createSurveyLink}
                    disabled={creating}
                    className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    {creating ? 'Skapar...' : 'Generera länk'}
                  </button>
                  <button
                    onClick={() => setShowCreateLink(false)}
                    className="text-white/40 hover:text-white text-sm px-4 py-2.5 transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              </>
            ) : (
              <div>
                <p className="text-green-400 text-sm font-medium mb-3">✅ Länk skapad! Skicka denna till BRF:en:</p>
                <div className="bg-black/30 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4 mb-4">
                  <span className="text-blue-300 text-sm break-all">{createdLink}</span>
                  <button
                    onClick={() => {
                      const el = document.createElement('textarea')
                      el.value = createdLink
                      document.body.appendChild(el)
                      el.select()
                      document.execCommand('copy')
                      document.body.removeChild(el)
                      alert('Länk kopierad!')
                    }}
                    className="shrink-0 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-2 rounded-lg transition-colors"
                  >
                    Kopiera
                  </button>
                </div>
                <button
                  onClick={() => { setShowCreateLink(false); setCreatedLink(''); setNewBrfName('') }}
                  className="text-white/40 hover:text-white text-sm transition-colors"
                >
                  Stäng
                </button>
              </div>
            )}
          </div>
        )}

        {/* Statistik */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <p className="text-3xl font-bold">{surveys.length}</p>
            <p className="text-white/40 text-sm mt-1">Totalt antal enkäter</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <p className="text-3xl font-bold text-green-400">
              {surveys.filter(s => s.status === 'completed').length}
            </p>
            <p className="text-white/40 text-sm mt-1">Genomförda</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <p className="text-3xl font-bold text-blue-400">
              {new Set(surveys.map(s => s.survey_year)).size}
            </p>
            <p className="text-white/40 text-sm mt-1">Unika år</p>
          </div>
        </div>

        {/* Sökfält */}
        {surveys.length > 0 && (
          <div className="flex gap-3 mb-6">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Sök på BRF-namn..."
                className="w-full bg-white/5 border border-white/20 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400 placeholder-white/30"
              />
            </div>
            <select
              value={searchYear}
              onChange={e => setSearchYear(e.target.value)}
              className="bg-white/5 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400"
            >
              <option value="">Alla år</option>
              {availableYears.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
            {(searchQuery || searchYear) && (
              <button
                onClick={() => { setSearchQuery(''); setSearchYear('') }}
                className="text-white/40 hover:text-white text-sm px-3 transition-colors"
              >
                Rensa
              </button>
            )}
          </div>
        )}

        {/* Enkätlista */}
        {loading ? (
          <div className="text-white/30 text-center py-20">Laddar...</div>
        ) : surveys.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <p className="text-lg mb-2">Inga enkäter ännu</p>
            <p className="text-sm">Enkäter visas här när BRF:er fyller i dem</p>
          </div>
        ) : filteredSurveys.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <p className="text-lg mb-2">Inga träffar</p>
            <p className="text-sm">Prova ett annat sökord eller år</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSurveys.map(survey => {
              const kpis = survey.kpi_results ?? []
              const reds = kpis.filter(k => k.traffic_light === 'red').length
              const yellows = kpis.filter(k => k.traffic_light === 'yellow').length
              const greens = kpis.filter(k => k.traffic_light === 'green').length

              return (
                <div key={survey.id} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between hover:bg-white/8 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-500/20 rounded-lg w-10 h-10 flex items-center justify-center text-blue-400 font-bold text-sm">
                      {survey.survey_year}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{survey.brf_name || `Enkät ${survey.survey_year}`}</p>
                        {(survey.version ?? 1) > 1 && (
                          <span className="text-xs bg-white/10 text-white/50 px-1.5 py-0.5 rounded">ver.{survey.version}</span>
                        )}
                      </div>
                      <p className="text-white/30 text-xs mt-0.5">
                        {survey.survey_year} · {new Date(survey.created_at).toLocaleDateString('sv-SE')} · <span className={survey.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}>{survey.status === 'completed' ? 'Genomförd' : 'Väntar'}</span>
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
                    <div className="flex gap-2 text-xs">
                      {greens > 0 && <span className="text-green-400">{greens} bra</span>}
                      {yellows > 0 && <span className="text-yellow-400">{yellows} bevaka</span>}
                      {reds > 0 && <span className="text-red-400">{reds} varning</span>}
                    </div>
                    {survey.token && (
                      <button
                        onClick={() => copyLink(survey.id, survey.token)}
                        className={`text-xs transition-colors ${copiedId === survey.id ? 'text-green-400' : 'text-white/40 hover:text-white'}`}
                      >
                        {copiedId === survey.id ? '✓ Kopierad' : 'Kopiera länk'}
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/results/${survey.id}`)}
                      className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                      Visa →
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
