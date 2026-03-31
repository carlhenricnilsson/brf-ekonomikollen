import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">

      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <span className="text-2xl font-bold tracking-tight">BRF-Ekonomi<span className="text-blue-400">kollen</span></span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors">Logga in</Link>
          <Link href="/survey" className="bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Starta enkät</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-24 pb-16 text-center">
        <div className="inline-block bg-blue-500/20 border border-blue-400/30 text-blue-300 text-sm px-4 py-1.5 rounded-full mb-6">Baserat på BFNAR 2023:1</div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
          Förstå er BRF:s<br /><span className="text-blue-400">ekonomiska hälsa</span>
        </h1>
        <p className="text-lg text-white/60 max-w-2xl mx-auto mb-10">
          BRF-Ekonomikollen beräknar automatiskt de 7 obligatoriska nyckeltalen för er bostadsrättsförening och ger er en tydlig analys med AI-drivna rekommendationer.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/survey" className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-colors">Starta gratis enkät →</Link>
          <Link href="#hur-det-fungerar" className="border border-white/20 hover:border-white/40 text-white/80 font-medium px-8 py-4 rounded-xl text-lg transition-colors">Hur det fungerar</Link>
        </div>
      </section>

      {/* KPI-översikt */}
      <section className="max-w-5xl mx-auto px-8 py-16" id="hur-det-fungerar">
        <h2 className="text-3xl font-bold text-center mb-4">7 nyckeltal – ett samlat betyg</h2>
        <p className="text-white/50 text-center mb-12">Alla nyckeltal beräknas automatiskt från er årsredovisning</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { nr: 1, namn: 'Årsavgift per kvm', enhet: 'kr/kvm bostadsrätt' },
            { nr: 2, namn: 'Skuldsättning per kvm', enhet: 'kr/kvm totalyta' },
            { nr: 3, namn: 'Räntekänslighet', enhet: '%' },
            { nr: 4, namn: 'Sparande per kvm', enhet: 'kr/kvm' },
            { nr: 5, namn: 'Energikostnad per kvm', enhet: 'kr/kvm' },
            { nr: 6, namn: 'Årsavgift per kvm totalyta', enhet: 'kr/kvm' },
            { nr: 7, namn: 'Belåning per kvm bostadsrätt', enhet: 'kr/kvm' },
          ].map((kpi) => (
            <div key={kpi.nr} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-start gap-4">
              <span className="bg-blue-500/20 text-blue-300 font-bold text-sm w-8 h-8 rounded-lg flex items-center justify-center shrink-0">{kpi.nr}</span>
              <div>
                <p className="font-medium text-white">{kpi.namn}</p>
                <p className="text-sm text-white/40">{kpi.enhet}</p>
              </div>
            </div>
          ))}
          <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl p-5 flex items-start gap-4">
            <span className="bg-blue-500/30 text-blue-300 font-bold text-sm w-8 h-8 rounded-lg flex items-center justify-center shrink-0">★</span>
            <div>
              <p className="font-medium text-white">Samlat betyg</p>
              <p className="text-sm text-white/40">Viktat genomsnitt av alla 7</p>
            </div>
          </div>
        </div>
      </section>

      {/* Steg */}
      <section className="max-w-4xl mx-auto px-8 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Så här fungerar det</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { steg: '1', titel: 'Fyll i enkäten', text: 'Ca 10–15 minuter. Hämta siffrorna från er senaste årsredovisning.' },
            { steg: '2', titel: 'Få din analys', text: 'Systemet beräknar alla 7 nyckeltal och AI:n skriver en skräddarsydd analys.' },
            { steg: '3', titel: 'Ladda ner rapport', text: 'En professionell PDF-rapport redo att presentera för styrelsen.' },
          ].map((s) => (
            <div key={s.steg} className="text-center">
              <div className="w-14 h-14 bg-blue-500 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">{s.steg}</div>
              <h3 className="font-semibold text-lg mb-2">{s.titel}</h3>
              <p className="text-white/50 text-sm">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-8 py-16 text-center">
        <div className="bg-blue-500/10 border border-blue-400/20 rounded-2xl p-10">
          <h2 className="text-3xl font-bold mb-4">Redo att ta pulsen på er förening?</h2>
          <p className="text-white/50 mb-8">Det tar 10–15 minuter. Ni behöver er senaste årsredovisning.</p>
          <Link href="/survey" className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-10 py-4 rounded-xl text-lg transition-colors inline-block">Starta enkäten nu →</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-white/30 text-sm">
        © 2026 BRF-Ekonomikollen · Governance at Work AB · governanceatwork.io
      </footer>

    </main>
  )
}
