import { useRef, useState } from 'react'
import { generateLesson, suggestTopic as suggestTopicAPI } from '../lib/api'
import { getLessons, getObservations } from '../lib/db'

// ─── SSE-Parser ───────────────────────────────────────────────────────────────
async function streamSSE(response, onChunk, signal) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      if (signal?.aborted) break
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)

        const dataLines = raw
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
        if (!dataLines.length) continue
        const dataStr = dataLines.join('\n')
        if (dataStr === '[DONE]') continue

        try {
          const evt = JSON.parse(dataStr)
          if (
            evt.type === 'content_block_delta' &&
            evt.delta?.type === 'text_delta' &&
            typeof evt.delta.text === 'string'
          ) {
            onChunk(evt.delta.text)
          } else if (evt.type === 'error') {
            throw new Error(evt.error?.message ?? 'Anthropic-Stream-Fehler')
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('Anthropic')) throw e
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ─── Partial JSON Extraction ──────────────────────────────────────────────────
function extractPartialLesson(jsonString) {
  const partial = {}

  const titelMatch = jsonString.match(/"titel"\s*:\s*"([^"]+)"/)
  if (titelMatch) partial.titel = titelMatch[1]

  const lernzieleMatch = jsonString.match(/"lernziele"\s*:\s*\[([\s\S]*?)\]/)
  if (lernzieleMatch) {
    try { partial.lernziele = JSON.parse(`[${lernzieleMatch[1]}]`) } catch (e) { /* incomplete */ }
  }

  const phasenStart = jsonString.indexOf('"phasen"')
  if (phasenStart !== -1) {
    const afterPhasen = jsonString.indexOf('[', phasenStart)
    if (afterPhasen !== -1) {
      try {
        const phasen = []
        let depth = 0, current = '', bracketDepth = 0
        for (let i = afterPhasen; i < jsonString.length; i++) {
          const char = jsonString[i]
          if (char === '[') bracketDepth++
          if (char === ']') { bracketDepth--; if (bracketDepth === 0) break }
          if (char === '{') depth++
          if (char === '}') depth--
          current += char
          if (depth === 0 && current.trim().endsWith('}')) {
            try {
              const cleaned = current.trim().replace(/^[,\[\s]*/, '').trim()
              if (cleaned.startsWith('{')) { phasen.push(JSON.parse(cleaned)); current = '' }
            } catch (e) { /* incomplete */ }
          }
        }
        if (phasen.length > 0) partial.phasen = phasen
      } catch (e) { /* incomplete */ }
    }
  }

  const diffMatch = jsonString.match(/"differenzierung"\s*:\s*\{([\s\S]*?)\}(?:\s*,\s*"wissenschaft"|\s*\})/)
  if (diffMatch) {
    try { partial.differenzierung = JSON.parse(`{${diffMatch[1]}}`) } catch (e) { /* incomplete */ }
  }

  const wissMatch = jsonString.match(/"wissenschaft"\s*:\s*"([\s\S]*?)"(?:\s*\}|$)/)
  if (wissMatch) partial.wissenschaft = wissMatch[1]

  return partial
}

// ─── Lesson Content Parser ────────────────────────────────────────────────────
export function parseLessonContent(content) {
  if (!content || !content.trim()) return null

  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && parsed.titel) return parsed
  } catch (e) { /* try next */ }

  try {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      const parsed = JSON.parse(match[1].trim())
      if (parsed && typeof parsed === 'object' && parsed.titel) return parsed
    }
  } catch (e) { /* try next */ }

  try {
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      const parsed = JSON.parse(content.substring(firstBrace, lastBrace + 1))
      if (parsed && typeof parsed === 'object' && parsed.titel) return parsed
    }
  } catch (e) { /* give up */ }

  return null
}

/**
 * Kapselt die gesamte Stream-Logik: Stunden generieren, verfeinern, Themen vorschlagen.
 *
 * @param {Object}   params.activeClass          - Aktive Klasse
 * @param {Object}   params.slot                 - Aktiver Slot { unit, slotIndex }
 * @param {string}   params.topic                - Aktuelles Thema
 * @param {string[]} params.students             - Schüler-Array
 * @param {Function} params.handleAutoSave       - Auto-Save Callback aus useLessonSave
 * @param {Function} params.setHasUnsavedRefinement - Setter aus useLessonSave
 * @param {Function} params.resetSave            - Reset-Callback aus useLessonSave
 */
export function useLessonStream({
  activeClass,
  slot,
  topic,
  students,
  content,
  setContent,
  handleAutoSave,
  setHasUnsavedRefinement,
  resetSave,
}) {
  const [parsedLesson, setParsedLesson] = useState(null)
  const [partialLesson, setPartialLesson] = useState({})

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)

  const [refinement, setRefinement] = useState('')
  const [refining, setRefining] = useState(false)

  const [topicSuggesting, setTopicSuggesting] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState([])

  const abortRef = useRef(null)

  // ─── Payload-Builder für API-Call ──────────────────────────────────────────
  async function buildStreamPayload({ previousContent, refinementRequest } = {}) {
    const studentNames = students.map((s) => s.name)
    const latestObs = {}
    if (students.length) {
      const { data: obs } = await getObservations(students.map((s) => s.id))
      if (obs) {
        for (const o of obs) {
          if (!latestObs[o.student_id]) latestObs[o.student_id] = o.note
        }
      }
    }
    const studentNotes = {}
    for (const s of students) studentNotes[s.name] = latestObs[s.id] ?? s.notes ?? ''

    const { data: prevLessons } = await getLessons(activeClass.id, 5)
    const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

    return {
      className: activeClass.name,
      subject: (activeClass.subjects ?? []).join(', ') || activeClass.subject,
      school_type: activeClass.school_type ?? '',
      grade: activeClass.grade,
      state: activeClass.state,
      studentNames,
      studentNotes,
      topic: topic.trim(),
      previousLessons,
      curriculumUnitTitle: slot?.unit?.title ?? '',
      curriculumUnitDescription: slot?.unit?.description ?? '',
      ...(previousContent && refinementRequest ? { previousContent, refinementRequest } : {}),
    }
  }

  // ─── Stunde generieren ─────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!topic.trim()) { setGenError('Bitte ein Thema eingeben.'); return }
    setGenerating(true); setGenError(null); setContent('')
    setPartialLesson({}); setParsedLesson(null)
    resetSave()

    try {
      const controller = new AbortController()
      abortRef.current = controller
      const payload = await buildStreamPayload()
      const { response, signal } = await generateLesson(payload, controller.signal)

      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        setContent(acc)
        setPartialLesson(extractPartialLesson(acc))
      }, signal)

      const parsed = parseLessonContent(acc)
      if (parsed) {
        setParsedLesson(parsed)
        setPartialLesson({})  // leeren — parsedLesson übernimmt ab jetzt
        await handleAutoSave(acc)
      }
    } catch (err) {
      if (err.name !== 'AbortError') setGenError(err.message ?? String(err))
    } finally {
      setGenerating(false)
    }
  }

  // ─── Stunde verfeinern ─────────────────────────────────────────────────────
  async function handleRefine() {
    const req = refinement.trim()
    if (!req || !content) return
    setRefining(true); setGenError(null)
    const prevParsedLesson = parsedLesson
    setContent('')
    setPartialLesson({})

    try {
      const previousContent = parsedLesson ? JSON.stringify(parsedLesson) : content
      const controller = new AbortController()
      abortRef.current = controller
      const payload = await buildStreamPayload({ previousContent, refinementRequest: req })
      const { response, signal } = await generateLesson(payload, controller.signal)

      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        setContent(acc)
        setPartialLesson(extractPartialLesson(acc))
      }, signal)
      setRefinement('')

      const parsed = parseLessonContent(acc)
      if (parsed) {
        setParsedLesson(parsed)
        setPartialLesson({})  // leeren — parsedLesson übernimmt ab jetzt
        setHasUnsavedRefinement(true)
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setGenError(err.message ?? String(err))
        setParsedLesson(prevParsedLesson)
      }
    } finally {
      setRefining(false)
    }
  }

  // ─── Abbrechen ─────────────────────────────────────────────────────────────
  function handleAbort() {
    abortRef.current?.abort()
  }

  // ─── Themenvorschläge laden ────────────────────────────────────────────────
  async function suggestTopic() {
    if (!activeClass || !slot) return
    setTopicSuggesting(true)
    try {
      const { data: prevLessons } = await getLessons(activeClass.id, 5)
      const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

      const result = await suggestTopicAPI({
        suggestionOnly: true,
        slotIndex: slot.slotIndex,
        curriculumUnitTitle: slot.unit.title,
        curriculumUnitDescription: slot.unit.description ?? '',
        estimatedHours: slot.unit.estimated_hours,
        previousLessons,
      })

      if (result.suggestions && Array.isArray(result.suggestions)) {
        setAiSuggestions(result.suggestions)
      }
    } catch (err) {
      console.error('suggestTopic error:', err)
      setAiSuggestions([])
    } finally {
      setTopicSuggesting(false)
    }
  }

  // ─── Reset (beim Slot-Wechsel) ─────────────────────────────────────────────
  function resetStream() {
    abortRef.current?.abort()
    setGenerating(false)
    setRefining(false)
    setGenError(null)
    setRefinement('')
    setTopicSuggesting(false)
    setAiSuggestions([])
    setContent('')     // setContent kommt als Parameter rein
    setParsedLesson(null)
    setPartialLesson({})
  }

  return {
    // State (content/setContent bleiben in LessonWorkspace)
    parsedLesson, setParsedLesson,
    partialLesson, setPartialLesson,
    generating,
    genError, setGenError,
    refinement, setRefinement,
    refining,
    topicSuggesting,
    aiSuggestions, setAiSuggestions,
    // Aktionen
    handleGenerate,
    handleRefine,
    handleAbort,
    suggestTopic,
    resetStream,
  }
}
