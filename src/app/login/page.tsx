'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Suspense } from 'react'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [brfName, setBrfName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Detektera ?reset=true i URL:en (efter klick på återställningslänk)
  useEffect(() => {
    if (searchParams.get('reset') === 'true') {
      setMode('reset')
    }
  }, [searchParams])

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (newPassword.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken')
      setLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Lösenorden matchar inte')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setError(`Kunde inte uppdatera lösenordet: ${error.message}`)
    } else {
      setMessage('Lösenordet har uppdaterats! Du kan nu logga in med ditt nya lösenord.')
      setMode('login')
    }
    setLoading(false)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Fel e-post eller lösenord')
      setLoading(false)
      return
    }

    // Hämta användarens roll
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    const role = profile?.role
    if (role === 'superadmin') router.push('/admin')
    else if (role === 'brf_admin') router.push('/dashboard')
    else router.push('/dashboard')
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!brfName.trim()) {
      setError('Ange din BRF:s namn')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken')
      setLoading(false)
      return
    }

    // Skapa konto via server-side admin-API. Auto-bekräftar e-posten så
    // att användaren kan logga in direkt, och returnerar tydligt fel om
    // e-posten redan finns.
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          brf_name: brfName.trim(),
          phone: phone.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Kunde inte skapa konto')
        setLoading(false)
        return
      }
    } catch (e) {
      setError(`Kunde inte nå servern: ${e instanceof Error ? e.message : 'okänt fel'}`)
      setLoading(false)
      return
    }

    // Logga in direkt (kontot är redan auto-bekräftat)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      setError(`Konto skapat men kunde inte logga in automatiskt: ${loginError.message}`)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    setLoading(false)
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?reset=true`,
    })

    if (error) {
      setError('Kunde inte skicka återställningslänk. Kontrollera e-postadressen.')
    } else {
      setMessage('En länk för att återställa lösenordet har skickats till din e-post.')
    }
    setLoading(false)
  }

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
    setMessage('')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold">BRF-Ekonomi<span className="text-blue-400">kollen</span></h1>
          <p className="text-white/40 text-sm mt-2">
            {mode === 'login' && 'Logga in för att fortsätta'}
            {mode === 'register' && 'Skapa ett konto'}
            {mode === 'forgot' && 'Återställ ditt lösenord'}
            {mode === 'reset' && 'Ange ditt nya lösenord'}
          </p>
        </div>

        {message && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm mb-4">
            {message}
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1.5">E-post</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="namn@foretag.se"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Lösenord</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>

            <div className="flex justify-between text-sm">
              <button type="button" onClick={() => switchMode('forgot')} className="text-white/40 hover:text-white transition-colors">
                Glömt lösenord?
              </button>
              <button type="button" onClick={() => switchMode('register')} className="text-blue-400 hover:text-blue-300 transition-colors">
                Skapa konto
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Vilken BRF tillhör du?</label>
              <input
                type="text"
                value={brfName}
                onChange={e => setBrfName(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="T.ex. BRF Solgläntan"
              />
              <p className="text-white/30 text-xs mt-1">Namnet normaliseras automatiskt till formatet "BRF Namn"</p>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5">E-post</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="namn@foretag.se"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Mobilnummer</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="070-123 45 67"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Lösenord</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Minst 6 tecken"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Skapar konto...' : 'Registrera konto'}
            </button>

            <p className="text-center text-sm text-white/40">
              Har du redan ett konto?{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-blue-400 hover:text-blue-300 transition-colors">
                Logga in
              </button>
            </p>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Nytt lösenord</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Minst 6 tecken"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Bekräfta lösenord</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="Upprepa lösenordet"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Sparar...' : 'Spara nytt lösenord'}
            </button>

            <p className="text-center text-sm text-white/40">
              <button type="button" onClick={() => switchMode('login')} className="text-blue-400 hover:text-blue-300 transition-colors">
                Tillbaka till inloggning
              </button>
            </p>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1.5">E-post</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400 transition-colors"
                placeholder="namn@foretag.se"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Skickar...' : 'Skicka återställningslänk'}
            </button>

            <p className="text-center text-sm text-white/40">
              Kom du på lösenordet?{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-blue-400 hover:text-blue-300 transition-colors">
                Logga in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-white/40">Laddar...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
