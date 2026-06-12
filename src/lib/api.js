/**
 * src/lib/api.js – Edge Function Calls
 * 
 * Alle Aufrufe zu Supabase Edge Functions sind hier zentralisiert.
 * Named exports für alle API-Funktionen.
 * 
 * Jede Funktion:
 * - Holt den Auth-Token aus der Session
 * - Nutzt VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY
 * - Gibt { response, signal } zurück oder { error }
 */

import { supabase } from './supabase'
import { getSession } from './auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ─── GENERATE LESSON ──────────────────────────────────────────────────
/**
 * Generiere eine Unterrichtsstunde via Streaming
 * @param {Object} payload - Lektion-Parameter (className, subject, grade, etc.)
 * @param {AbortSignal} signal - AbortController Signal für Abbruch
 */
export async function generateLesson(payload, signal) {
  const { data: sessionData } = await getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    throw new Error('Nicht eingeloggt.')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(
      `Generierung fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
    )
  }

  return { response, signal }
}

// ─── GENERATE CURRICULUM ──────────────────────────────────────────────
/**
 * Generiere einen Lehrplan für eine Klasse
 * @param {Object} payload - Curriculum-Parameter
 */
export async function generateCurriculum(payload) {
  const { data: sessionData } = await getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    throw new Error('Nicht eingeloggt.')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-curriculum`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(
      `Lehrplan-Generierung fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
    )
  }

  return await response.json()
}

// ─── SUGGEST MATERIALS ────────────────────────────────────────────────
/**
 * Schlag Lernmaterialien für eine Stunde vor
 * @param {Object} payload - Material-Parameter (lessonContent, lessonTitle, subject, grade, schoolType)
 */
export async function suggestMaterials(payload) {
  const { data: sessionData } = await getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    throw new Error('Nicht eingeloggt.')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/suggest-materials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(
      `Material-Vorschlag fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
    )
  }

  return await response.json()
}

// ─── SUGGEST LEARNING ────────────────────────────────────────────────
/**
 * Schlag Fortbildungsressourcen für Lehrkräfte vor
 * @param {Object} payload - Learning-Parameter (lessonContent, lessonTitle, subject, grade, schoolType)
 */
export async function suggestLearning(payload) {
  const { data: sessionData } = await getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    throw new Error('Nicht eingeloggt.')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/suggest-learning`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(
      `Fortbildungsvorschlag fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
    )
  }

  return await response.json()
}

// ─── SUGGEST TOPIC ───────────────────────────────────────────────────
/**
 * Schlag Stundentitel basierend auf Lehrplan vor
 * @param {Object} payload - Topic-Parameter (slotIndex, curriculumUnitTitle, estimatedHours, previousLessons)
 */
export async function suggestTopic(payload) {
  const { data: sessionData } = await getSession()
  const accessToken = sessionData?.session?.access_token

  if (!accessToken) {
    throw new Error('Nicht eingeloggt.')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(
      `Vorschlag fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
    )
  }

  return await response.json()
}
