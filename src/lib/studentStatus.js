/**
 * Sehr einfache Heuristik, um aus einer Beobachtung einen Förderbedarf-Status
 * abzuleiten. 'red' = dringender Förderbedarf, 'yellow' = beobachten,
 * 'green' = unauffällig/positiv, 'neutral' = keine Beobachtung vorhanden.
 */
const RED_KEYWORDS = [
  'schwierigkeit',
  'problem',
  'kann nicht',
  'kann kaum',
  'fehlt',
  'stört',
  'verweigert',
  'aggressiv',
  'überfordert',
  'verstanden nicht',
  'versteht nicht',
  'braucht hilfe',
  'braucht dringend',
  'förderbedarf',
  'kämpft',
  'hat mühe',
]

const YELLOW_KEYWORDS = [
  'unsicher',
  'manchmal',
  'teilweise',
  'leicht',
  'noch',
  'zögert',
  'zurückhaltend',
  'still',
  'abgelenkt',
  'unaufmerksam',
  'müde',
]

const GREEN_KEYWORDS = [
  'stark',
  'sehr gut',
  'gut',
  'engagiert',
  'aktiv',
  'aufmerksam',
  'verstanden',
  'sicher',
  'selbstständig',
  'hilft',
  'motiviert',
]

export function statusFromObservation(text) {
  if (!text || !text.trim()) return 'neutral'
  const t = text.toLowerCase()
  for (const k of RED_KEYWORDS) if (t.includes(k)) return 'red'
  for (const k of YELLOW_KEYWORDS) if (t.includes(k)) return 'yellow'
  for (const k of GREEN_KEYWORDS) if (t.includes(k)) return 'green'
  return 'neutral'
}

export const STATUS_LABEL = {
  red: 'Förderbedarf',
  yellow: 'Beobachten',
  green: 'Unauffällig',
  neutral: 'Keine Notiz',
}
