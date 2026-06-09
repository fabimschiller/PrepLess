import { supabase } from './supabase'

/**
 * Ruft die Edge Function `generate-curriculum` auf.
 * Wirft bei Fehlern.
 */
export async function generateCurriculumForClass(cls) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('Nicht eingeloggt.')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const res = await fetch(`${supabaseUrl}/functions/v1/generate-curriculum`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      classId: cls.id,
      subject: cls.subject,
      subjects: cls.subjects ?? [],
      school_type: cls.school_type ?? '',
      grade: cls.grade,
      state: cls.state,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `Lehrplan-Generierung fehlgeschlagen (${res.status})${
        errText ? `: ${errText}` : ''
      }`
    )
  }

  const json = await res.json().catch(() => ({}))
  return json.units ?? []
}

const MONTH_LABELS = [
  null,
  'September',
  'Oktober',
  'November',
  'Dezember',
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
]

// Sep = 1 … Juli = 10. Aug = 0 (Ferien).
export function getCurrentSchoolMonth(date = new Date()) {
  const m = date.getMonth()
  if (m >= 8) return m - 7
  if (m <= 6) return m + 5
  return 0
}

export function monthLabel(n) {
  return MONTH_LABELS[n] ?? `M${n}`
}

export function monthRangeLabel(start, end) {
  const a = monthLabel(start)
  const b = monthLabel(end)
  return start === end ? a : `${a} – ${b}`
}

export function computeUnitStatus(unit, currentMonth = getCurrentSchoolMonth()) {
  if (currentMonth === 0) return 'upcoming'
  if (unit.end_month < currentMonth) return 'done'
  if (unit.start_month <= currentMonth && currentMonth <= unit.end_month) {
    return 'current'
  }
  return 'upcoming'
}

export function pickCurrentUnit(units) {
  const m = getCurrentSchoolMonth()
  const enriched = units.map((u) => ({
    ...u,
    status: computeUnitStatus(u, m),
  }))
  return (
    enriched.find((u) => u.status === 'current') ??
    enriched.find((u) => u.status === 'upcoming') ??
    null
  )
}
