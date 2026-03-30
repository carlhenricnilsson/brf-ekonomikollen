// Normalisera BRF-namn
export function normalizeBrfName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(\w)/, (c) => c.toUpperCase())
}

// Bygg rapportnamn med versionshantering
export function buildReportName(brfName: string, year: number, version: number): string {
  const normalized = normalizeBrfName(brfName || 'Okänd BRF')
  const base = `${normalized} ${year}`
  return version > 1 ? `${base} ver.${version}` : base
}
