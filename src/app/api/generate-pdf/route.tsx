import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { resolveUser } from '@/lib/auth'
import { buildReportName } from '@/lib/report-name'
import { rawP, clampP, fmtScaleLabel, KPI_THRESH } from '@/lib/kpi-scale'
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const TC = { green: '#22c55e', yellow: '#eab308', red: '#ef4444', neutral: '#60a5fa' }

// Tröskelvärden och positionslogik delas med resultatsidan via @/lib/kpi-scale.

const s = StyleSheet.create({
  page:         { backgroundColor: '#0f172a', padding: '28 32 44 32', fontFamily: 'Helvetica', color: '#ffffff' },
  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1 solid #1e293b' },
  logo:         { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  logoBlue:     { color: '#60a5fa' },
  headerRight:  { fontSize: 9, color: '#64748b' },
  // Title block
  titleBlock:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  brfLabel:     { fontSize: 9, color: '#60a5fa', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  brfTitle:     { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 2 },
  brfSub:       { fontSize: 8, color: '#94a3b8' },
  badge:        { backgroundColor: '#1e3a5f', padding: '4 10', borderRadius: 6 },
  badgeText:    { fontSize: 8, color: '#93c5fd' },
  // Summary boxes
  summaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
  sumBox:       { flex: 1, borderRadius: 6, padding: '6 0', alignItems: 'center' },
  sumNum:       { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  sumLabel:     { fontSize: 8 },
  // Section title
  secTitle:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 6, paddingBottom: 4, borderBottom: '1 solid #1e293b' },
  // KPI rows (taller now, with scale)
  kpiRow:       { backgroundColor: '#1e293b', borderRadius: 6, padding: '8 12', marginBottom: 5 },
  kpiTop:       { flexDirection: 'row', alignItems: 'center' },
  kpiBadge:     { width: 24, height: 24, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  kpiBadgeTxt:  { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  kpiName:      { fontSize: 10, color: '#e2e8f0', flex: 1 },
  kpiVal:       { fontSize: 12, fontFamily: 'Helvetica-Bold', marginRight: 6 },
  kpiStatus:    { fontSize: 7, padding: '2 5', borderRadius: 4, fontFamily: 'Helvetica-Bold' },
  // Scale
  scaleWrap:    { marginTop: 8, position: 'relative' },
  scaleBar:     { flexDirection: 'row', height: 4, borderRadius: 2 },
  zGreen:       { backgroundColor: 'rgba(74,222,128,0.85)' },
  zYellow:      { backgroundColor: 'rgba(234,179,8,0.65)' },
  zRed:         { backgroundColor: 'rgba(248,113,113,0.85)' },
  marker:       { position: 'absolute', top: -5, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#0f172a' },
  scaleLabels:  { position: 'relative', height: 14, marginTop: 3 },
  // SPEGELVÄND: grön tröskel till höger (80%), röd tröskel till vänster (20%)
  lblWrapG:     { position: 'absolute', left: '80%', marginLeft: -30, width: 60, alignItems: 'center' },
  lblWrapR:     { position: 'absolute', left: '20%', marginLeft: -30, width: 60, alignItems: 'center' },
  lblTxtG:      { fontSize: 11, color: '#4ade80', fontFamily: 'Helvetica-Bold' },
  lblTxtR:      { fontSize: 11, color: '#f87171', fontFamily: 'Helvetica-Bold' },
  // Footer
  footer:       { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #1e293b', paddingTop: 6 },
  footerTxt:    { fontSize: 7, color: '#475569' },
  // AI page
  aiPage:       { backgroundColor: '#0f172a', padding: '28 32 44 32', fontFamily: 'Helvetica', color: '#ffffff' },
  aiSec:        { backgroundColor: '#1e293b', borderRadius: 8, padding: 16, marginTop: 4 },
  aiHead:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1 solid #334155' },
  aiBadge:      { backgroundColor: '#1e3a5f', padding: '3 8', borderRadius: 5, marginRight: 10 },
  aiBadgeTxt:   { fontSize: 9, color: '#93c5fd', fontFamily: 'Helvetica-Bold' },
  aiTitle:      { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  aiSub:        { fontSize: 8, color: '#64748b' },
  aiH2:         { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 10, marginBottom: 4 },
  aiBody:       { fontSize: 9, color: '#cbd5e1', lineHeight: 1.7 },
})

function fmtVal(value: number, unit: string) {
  if (unit === '%') return `${value.toFixed(1)}%`
  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function getLabel(light: string) {
  if (light === 'green')  return 'Bra'
  if (light === 'yellow') return 'Bevaka'
  if (light === 'red')    return 'Varning'
  return 'Info'
}

// Trafikljus-emoji i AI-texten kan PDF-fonten inte rendera (visas som skräp,
// t.ex. "=4"). Vi byter dem mot en riktig färgad cirkel (View) i samma
// storlek som trafikljusen på KPI-skalan.
const TL_RED    = String.fromCodePoint(0x1F534)
const TL_YELLOW = String.fromCodePoint(0x1F7E1)
const TL_GREEN  = String.fromCodePoint(0x1F7E2)

function lineDotColor(line: string): string | null {
  if (line.includes(TL_RED))    return '#f87171'
  if (line.includes(TL_YELLOW)) return '#facc15'
  if (line.includes(TL_GREEN))  return '#4ade80'
  return null
}

// Tar bort emoji (och ev. tomma "()" runt dem) samt markdown-fetstil.
function stripEmoji(line: string): string {
  return line
    .replace(/\s*\(\s*(\u{1F534}|\u{1F7E1}|\u{1F7E2})\s*\)/gu, '')
    .replace(/(\u{1F534}|\u{1F7E1}|\u{1F7E2})/gu, '')
    .replace(/\*\*/g, '')
    .replace(/^[#\-*]+\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function renderAIText(text: string) {
  return text.split('\n').map((line, i) => {
    if (/^[-*]{3,}$/.test(line.trim()))       return null
    if (/^\|[\s|:-]+\|$/.test(line.trim()))   return null
    if (line.trim() === '') return <Text key={i} style={{ fontSize: 2 }}> </Text>

    // Rad med trafikljus-emoji → färgad cirkel + fet text
    const dot = lineDotColor(line)
    if (dot) {
      return (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 1 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot, marginRight: 6 }} />
          <Text style={[s.aiBody, { fontFamily: 'Helvetica-Bold', color: '#ffffff', flex: 1 }]}>{stripEmoji(line)}</Text>
        </View>
      )
    }

    if (line.startsWith('### ')) return <Text key={i} style={[s.aiH2, { fontSize: 11 }]}>{line.replace(/^###\s+/, '')}</Text>
    if (line.startsWith('## '))  return <Text key={i} style={s.aiH2}>{line.replace(/^##\s+/, '')}</Text>
    if (line.startsWith('# '))   return <Text key={i} style={[s.aiH2, { fontSize: 14 }]}>{line.replace(/^#\s+/, '')}</Text>
    if (line.startsWith('- ') || line.startsWith('* '))
      return <Text key={i} style={[s.aiBody, { marginLeft: 10 }]}>{'• ' + line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '')}</Text>
    if (line.includes('|')) return null
    return <Text key={i} style={s.aiBody}>{line.replace(/\*\*/g, '')}</Text>
  })
}

export async function GET(req: NextRequest) {
  const surveyId = req.nextUrl.searchParams.get('surveyId')
  const include  = req.nextUrl.searchParams.get('include') ?? 'all'   // 'kpi' | 'ai' | 'all'
  if (!surveyId) return NextResponse.json({ error: 'Missing surveyId' }, { status: 400 })

  // Åtkomstgrind: PDF endast för superadmin eller den som betalat för
  // enkäten (speglar paywall, stänger bypass). Anonym blockeras – ser
  // ännu rapporten på webben men får inte den nedladdningsbara PDF:en.
  const { userId, role } = await resolveUser(req)
  if (role !== 'superadmin') {
    if (!userId) {
      return NextResponse.json({ error: 'Rapporten kräver upplåsning' }, { status: 403 })
    }
    const { data: paid } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('user_id', userId)
      .eq('survey_id', surveyId)
      .eq('status', 'completed')
      .limit(1)
    if (!paid || paid.length === 0) {
      return NextResponse.json({ error: 'Rapporten kräver upplåsning' }, { status: 403 })
    }
  }

  const [{ data: survey }, { data: kpis }, , { data: aiData }] = await Promise.all([
    supabaseAdmin.from('surveys').select('*').eq('id', surveyId).single(),
    supabaseAdmin.from('kpi_results').select('*').eq('survey_id', surveyId).order('kpi_number'),
    supabaseAdmin.from('answers').select('*').eq('survey_id', surveyId),
    supabaseAdmin.from('ai_analyses').select('*').eq('survey_id', surveyId).order('created_at', { ascending: false }).limit(1),
  ])

  if (!survey || !kpis) return NextResponse.json({ error: 'Enkät hittades inte' }, { status: 404 })

  // Arkiverade enkäter genererar inte PDF (återställ den först om PDF behövs)
  if (survey.deleted_at) return NextResponse.json({ error: 'Enkäten är arkiverad' }, { status: 404 })

  const reportName  = buildReportName(survey.brf_name || 'Okänd BRF', survey.survey_year, survey.version || 1)
  const aiAnalysis  = aiData?.[0]?.analysis_text || ''
  const today       = new Date().toLocaleDateString('sv-SE')
  const redCount    = kpis.filter(k => k.traffic_light === 'red').length
  const yellowCount = kpis.filter(k => k.traffic_light === 'yellow').length
  const greenCount  = kpis.filter(k => k.traffic_light === 'green').length

  const showAI = aiAnalysis.length > 0 && include !== 'kpi'

  const kpiPage = (
    <Page key="kpi" size="A4" style={s.page}>

      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>BRF-Ekonomi<Text style={s.logoBlue}>kollen</Text></Text>
        <Text style={s.headerRight}>{reportName} · Baserat på BFNAR 2023:1</Text>
      </View>

      {/* Titel + datum */}
      <View style={s.titleBlock}>
        <View>
          <Text style={s.brfLabel}>BRF-EKONOMIKOLLEN</Text>
          <Text style={s.brfTitle}>{reportName}</Text>
          <Text style={s.brfSub}>Ekonomisk hälsoanalys · Baserat på BFNAR 2023:1</Text>
        </View>
        <View style={s.badge}>
          <Text style={s.badgeText}>Genererad {today}</Text>
        </View>
      </View>

      {/* Sammanfattning – 3 boxar */}
      <View style={s.summaryRow}>
        <View style={[s.sumBox, { backgroundColor: '#14532d' }]}>
          <Text style={[s.sumNum, { color: '#4ade80' }]}>{greenCount}</Text>
          <Text style={[s.sumLabel, { color: '#86efac' }]}>Bra</Text>
        </View>
        <View style={[s.sumBox, { backgroundColor: '#713f12' }]}>
          <Text style={[s.sumNum, { color: '#fbbf24' }]}>{yellowCount}</Text>
          <Text style={[s.sumLabel, { color: '#fde68a' }]}>Bevaka</Text>
        </View>
        <View style={[s.sumBox, { backgroundColor: '#7f1d1d' }]}>
          <Text style={[s.sumNum, { color: '#f87171' }]}>{redCount}</Text>
          <Text style={[s.sumLabel, { color: '#fca5a5' }]}>Varning</Text>
        </View>
      </View>

      {/* KPI-rubrik */}
      <Text style={s.secTitle}>De 7 obligatoriska nyckeltalen</Text>

      {/* KPI-rader */}
      {kpis.map(kpi => {
        const color   = TC[kpi.traffic_light as keyof typeof TC] || TC.neutral
        const thresh  = KPI_THRESH[kpi.kpi_number]
        const mp      = thresh ? clampP(rawP(Number(kpi.value), thresh)) : 50
        const dotColor = kpi.traffic_light === 'green' ? '#4ade80'
                       : kpi.traffic_light === 'yellow' ? '#facc15'
                       : kpi.traffic_light === 'red'    ? '#f87171'
                       : '#60a5fa'

        return (
          <View key={kpi.kpi_number} style={s.kpiRow} wrap={false}>
            {/* Top row: badge + name + value + status */}
            <View style={s.kpiTop}>
              <View style={[s.kpiBadge, { backgroundColor: color + '33', borderWidth: 1, borderColor: color + '55' }]}>
                <Text style={[s.kpiBadgeTxt, { color }]}>{kpi.kpi_number}</Text>
              </View>
              <Text style={s.kpiName}>{kpi.kpi_name}</Text>
              <Text style={[s.kpiVal, { color }]}>{fmtVal(Number(kpi.value), kpi.unit)}</Text>
              <View style={{ backgroundColor: color + '22', borderRadius: 4, padding: '2 5' }}>
                <Text style={[s.kpiStatus, { color }]}>{getLabel(kpi.traffic_light)}</Text>
              </View>
            </View>

            {/* Scale */}
            {thresh && (
              <View style={s.scaleWrap}>
                {/* SPEGELVÄND: dåligt (rött) vänster, bra (grönt) höger */}
                <View style={s.scaleBar}>
                  {/* 0-10%: dashed red (full color) - 4 dashes */}
                  <View style={{ width: '10%', height: 4, flexDirection: 'row' }}>
                    <View style={{ flex: 1, backgroundColor: '#f87171' }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1, backgroundColor: '#f87171' }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1, backgroundColor: '#f87171' }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1, backgroundColor: '#f87171' }} />
                  </View>
                  {/* 10-20%: solid red */}
                  <View style={[s.zRed,    { width: '10%' }]} />
                  {/* 20-80%: solid yellow */}
                  <View style={[s.zYellow, { width: '60%' }]} />
                  {/* 80-90%: solid green */}
                  <View style={[s.zGreen,  { width: '10%' }]} />
                  {/* 90-100%: dashed green (full color) - 4 dashes */}
                  <View style={{ width: '10%', height: 4, flexDirection: 'row' }}>
                    <View style={{ flex: 1, backgroundColor: '#4ade80' }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1, backgroundColor: '#4ade80' }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1, backgroundColor: '#4ade80' }} />
                    <View style={{ flex: 1 }} />
                    <View style={{ flex: 1, backgroundColor: '#4ade80' }} />
                  </View>
                </View>
                {/* Marker dot – spegelvänd position (100 − mp) */}
                <View style={[s.marker, { left: `${100 - mp}%`, marginLeft: -7, backgroundColor: dotColor }]} />
                {/* Labels */}
                <View style={s.scaleLabels}>
                  <View style={s.lblWrapG}>
                    <Text style={s.lblTxtG}>{fmtScaleLabel(thresh.green, kpi.unit)}</Text>
                  </View>
                  <View style={s.lblWrapR}>
                    <Text style={s.lblTxtR}>{fmtScaleLabel(thresh.red, kpi.unit)}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )
      })}

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerTxt}>BRF-Ekonomikollen · Governance at Work AB · governanceatwork.io</Text>
        <Text style={s.footerTxt}>Källa: HSB, Riksbyggen, Nabo, FI 2024 · {today}</Text>
      </View>
    </Page>
  )

  const aiPage = showAI ? (
    <Page key="ai" size="A4" style={s.aiPage}>
      <View style={s.header}>
        <Text style={s.logo}>BRF-Ekonomi<Text style={s.logoBlue}>kollen</Text></Text>
        <Text style={s.headerRight}>{reportName}</Text>
      </View>
      <Text style={[s.secTitle, { fontSize: 13, marginBottom: 10 }]}>AI-analys och rekommendationer</Text>
      <View style={s.aiSec}>
        <View style={s.aiHead}>
          <View style={s.aiBadge}><Text style={s.aiBadgeTxt}>AI</Text></View>
          <View>
            <Text style={s.aiTitle}>Analys</Text>
            <Text style={s.aiSub}>Genererad av Claude · Baserad på era enkätsvar</Text>
          </View>
        </View>
        {renderAIText(aiAnalysis)}
      </View>
      <View style={s.footer}>
        <Text style={s.footerTxt}>AI-analysen är ett beslutsstöd och ersätter inte professionell ekonomisk rådgivning.</Text>
        <Text style={s.footerTxt}>{today}</Text>
      </View>
    </Page>
  ) : null

  const doc = (
    <Document title={reportName} author="BRF-Ekonomikollen">
      {kpiPage}
      {aiPage}
    </Document>
  )

  const buffer   = await renderToBuffer(doc)
  const filename = `${reportName.replace(/\s+/g, '_')}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
