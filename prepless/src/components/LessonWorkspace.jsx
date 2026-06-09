/**
 * LessonWorkspace – Arbeitsbereich für einen Slot
 *
 * Props:
 *   activeClass         – Klassen-Objekt
 *   slot                – { unit, slotIndex, lesson | null }  oder null
 *   onLessonSaved       – fn(lesson) – teilt Eltern mit dass eine Stunde gespeichert wurde
 *   onLessonUpdated     – fn({ id, status, conducted_at }) – Status-Update an Strip
 *   onObservationsSaved – fn()
 */
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import ConductedModal from './ConductedModal'
import './LessonWorkspace.css'

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

// ─── Beobachtungsformular ─────────────────────────────────────────────────────
function ObservationsForm({ students, lessonId, onSaved }) {
  const [observations, setObservations] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    const rows = students
      .map((s) => ({ lesson_id: lessonId, student_id: s.id, note: (observations[s.id] ?? '').trim() }))
      .filter((r) => r.note.length > 0)
    if (!rows.length) { setError('Bitte mindestens eine Beobachtung eintragen.'); return }
    setSaving(true); setError(null)
    const { error: insErr } = await supabase.from('observations').insert(rows)
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setSuccess('Beobachtungen gespeichert.')
    onSaved?.()
  }

  return (
    <form className="obs-form" onSubmit={handleSubmit}>
      <h3>Beobachtungen zur Stunde</h3>
      <div className="obs-grid">
        {students.map((s) => (
          <div key={s.id} className="field">
            <label htmlFor={`obs-${s.id}`}>{s.name}</label>
            <textarea
              id={`obs-${s.id}`} rows={2} placeholder="Beobachtung…"
              value={observations[s.id] ?? ''}
              onChange={(e) => setObservations((p) => ({ ...p, [s.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <button className="btn-primary" type="submit" disabled={saving}>
        {saving ? 'Speichert…' : 'Beobachtungen speichern'}
      </button>
    </form>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function LessonWorkspace({ activeClass, slot, onLessonSaved, onLessonUpdated, onObservationsSaved }) {
  // slot = { unit, slotIndex, lesson | null }

  const [topic, setTopic] = useState('')
  const [content, setContent] = useState('')       // generierter / geladener Text
  const [savedLessonId, setSavedLessonId] = useState(null)
  const [lessonStatus, setLessonStatus] = useState(null)     // 'planned' | 'conducted' | null
  const [conductedAt, setConductedAt] = useState(null)
  const [showConductedModal, setShowConductedModal] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(null)

  const [refinement, setRefinement] = useState('')
  const [refining, setRefining] = useState(false)

  const [students, setStudents] = useState([])

  const abortRef = useRef(null)
  // Merke den ursprünglichen Prompt für Refinement-Konversation
  const originalPromptRef = useRef(null)

  // Schüler laden
  useEffect(() => {
    if (!activeClass?.id) { setStudents([]); return }
    supabase
      .from('students')
      .select('id, name, notes')
      .eq('class_id', activeClass.id)
      .order('name', { ascending: true })
      .then(({ data }) => setStudents(data ?? []))
  }, [activeClass?.id])

  // Slot wechselt: Felder zurücksetzen / vorbelegen
  useEffect(() => {
    abortRef.current?.abort()
    setGenerating(false)
    setRefining(false)
    setSaveSuccess(null)
    setSaveError(null)
    setGenError(null)
    setRefinement('')
    originalPromptRef.current = null

    if (!slot) {
      setTopic(''); setContent(''); setSavedLessonId(null)
      setLessonStatus(null); setConductedAt(null)
      return
    }

    const { unit, slotIndex, lesson } = slot
    const slotNum = slotIndex + 1
    const total = unit.estimated_hours

    if (lesson) {
      setTopic(lesson.title ?? '')
      setContent(lesson.content ?? '')
      setSavedLessonId(lesson.id)
      setLessonStatus(lesson.status ?? 'planned')
      setConductedAt(lesson.conducted_at ?? null)
    } else {
      setTopic(`${unit.title} – Stunde ${slotNum} von ${total}`)
      setContent('')
      setSavedLessonId(null)
      setLessonStatus(null)
      setConductedAt(null)
    }
  }, [slot?.unit?.id, slot?.slotIndex, slot?.lesson?.id]) // eslint-disable-line

  async function callGenerateStream({ previousContent, refinementRequest } = {}) {
    if (!activeClass) return

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) throw new Error('Nicht eingeloggt.')

    // Letzte Beobachtungen je Schüler aufbauen
    const studentNames = students.map((s) => s.name)
    const latestObs = {}
    if (students.length) {
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, note')
        .in('student_id', students.map((s) => s.id))
        .order('created_at', { ascending: false })
      if (obs) {
        for (const o of obs) {
          if (!latestObs[o.student_id]) latestObs[o.student_id] = o.note
        }
      }
    }
    const studentNotes = {}
    for (const s of students) studentNotes[s.name] = latestObs[s.id] ?? s.notes ?? ''

    // Letzte 5 Stunden dieser Klasse
    const { data: prevLessons } = await supabase
      .from('lessons')
      .select('title, generated_at')
      .eq('class_id', activeClass.id)
      .order('generated_at', { ascending: false })
      .limit(5)
    const previousLessons = (prevLessons ?? []).map((l) => l.title).filter(Boolean)

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    const controller = new AbortController()
    abortRef.current = controller

    const payload = {
      className: activeClass.name,
      subject: activeClass.subject,
      grade: activeClass.grade,
      state: activeClass.state,
      studentNames,
      studentNotes,
      topic: topic.trim(),
      previousLessons,
      curriculumUnitTitle: slot?.unit?.title ?? '',
      curriculumUnitDescription: slot?.unit?.description ?? '',
      ...(previousContent && refinementRequest
        ? { previousContent, refinementRequest }
        : {}),
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Generierung fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`)
    }

    return { response, signal: controller.signal }
  }

  async function handleGenerate() {
    if (!topic.trim()) { setGenError('Bitte ein Thema eingeben.'); return }
    setGenerating(true); setGenError(null); setContent('')
    setSavedLessonId(null); setSaveSuccess(null); setSaveError(null)
    originalPromptRef.current = null

    try {
      const { response, signal } = await callGenerateStream()
      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        setContent(acc)
      }, signal)
      originalPromptRef.current = acc
    } catch (err) {
      if (err.name !== 'AbortError') setGenError(err.message ?? String(err))
    } finally {
      setGenerating(false)
    }
  }

  async function handleRefine() {
    const req = refinement.trim()
    if (!req || !content) return
    setRefining(true); setGenError(null)
    const prevContent = content
    setContent('')

    try {
      const { response, signal } = await callGenerateStream({
        previousContent: prevContent,
        refinementRequest: req,
      })
      let acc = ''
      await streamSSE(response, (chunk) => {
        acc += chunk
        setContent(acc)
      }, signal)
      setRefinement('')
    } catch (err) {
      if (err.name !== 'AbortError') { setGenError(err.message ?? String(err)); setContent(prevContent) }
    } finally {
      setRefining(false)
    }
  }

  function handleAbort() {
    abortRef.current?.abort()
  }

  function handleConductedDone({ status, conducted_at }) {
    setLessonStatus(status)
    setConductedAt(conducted_at)
    setShowConductedModal(false)
    onLessonUpdated?.({ id: savedLessonId, status, conducted_at })
  }

  async function handleSave() {
    if (!content.trim() || !activeClass || !slot) return
    setSaving(true); setSaveError(null); setSaveSuccess(null)

    const { data: lesson, error: insErr } = await supabase
      .from('lessons')
      .upsert({
        ...(savedLessonId ? { id: savedLessonId } : {}),
        class_id: activeClass.id,
        curriculum_unit_id: slot.unit.id,
        position: slot.slotIndex + 1,
        title: topic.trim() || `Stunde ${slot.slotIndex + 1}`,
        content: content.trim(),
      }, { onConflict: 'id' })
      .select()
      .single()

    setSaving(false)
    if (insErr) { setSaveError(insErr.message); return }
    setSavedLessonId(lesson.id)
    setLessonStatus(lesson.status ?? 'planned')
    setSaveSuccess('Stunde gespeichert.')
    onLessonSaved?.(lesson)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!slot) {
    return (
      <section className="workspace card">
        <p className="empty-state workspace-placeholder">
          Wähle eine Stunde aus dem Lehrplan oben.
        </p>
      </section>
    )
  }

  const { unit, slotIndex } = slot
  const isStreaming = generating || refining
  const hasContent = content.length > 0

  return (
    <section className="workspace card">
      <div className="workspace-header">
        <div>
          <h2>{unit.title} · Stunde {slotIndex + 1}</h2>
          <p className="card-subtitle">
            {activeClass.subject} · Jg. {activeClass.grade} · {activeClass.state}
          </p>
        </div>
      </div>

      {/* Topic */}
      <div className="field">
        <label htmlFor="ws-topic">Thema der Stunde</label>
        <input
          id="ws-topic"
          type="text"
          placeholder="z.B. Lineare Funktionen – Steigung erarbeiten"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={isStreaming}
        />
      </div>

      {/* Generate / Abort */}
      <div className="workspace-actions">
        <button
          className="btn-primary"
          type="button"
          onClick={handleGenerate}
          disabled={isStreaming || !topic.trim()}
        >
          {generating ? 'Generiert…' : 'Stunde generieren'}
        </button>
        {isStreaming && (
          <button className="btn-secondary" type="button" onClick={handleAbort}>
            Abbrechen
          </button>
        )}
      </div>

      {genError && <div className="alert error">{genError}</div>}

      {/* Stream-Inhalt */}
      {(isStreaming || hasContent) && (
        <div className="workspace-content-wrap">
          {isStreaming && !hasContent && (
            <div className="loading-indicator">
              <span className="spinner" />
              <span>Stunde wird generiert…</span>
            </div>
          )}
          {hasContent && (
            <pre className="workspace-content">
              {content}
              {isStreaming && <span className="caret">▍</span>}
            </pre>
          )}
        </div>
      )}

      {/* Speichern */}
      {hasContent && !isStreaming && (
        <div className="workspace-save-row">
          <button
            className="btn-primary"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Speichert…' : '💾 Stunde speichern'}
          </button>

          {/* Als durchgeführt markieren */}
          {savedLessonId && lessonStatus !== 'conducted' && (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setShowConductedModal(true)}
            >
              ✓ Als durchgeführt markieren
            </button>
          )}
          {savedLessonId && lessonStatus === 'conducted' && conductedAt && (
            <span className="workspace-conducted-label">
              ✓ Durchgeführt am {new Date(conductedAt).toLocaleDateString('de-DE', {
                day: '2-digit', month: '2-digit', year: 'numeric',
              })}
            </span>
          )}

          {saveError && <span className="workspace-save-error">{saveError}</span>}
          {saveSuccess && <span className="workspace-save-ok">{saveSuccess}</span>}
        </div>
      )}

      {/* Modal: Stunde durchgeführt */}
      {showConductedModal && savedLessonId && (
        <ConductedModal
          lessonId={savedLessonId}
          students={students}
          onDone={handleConductedDone}
          onClose={() => setShowConductedModal(false)}
        />
      )}

      {/* Refinement */}
      {hasContent && (
        <div className="workspace-refine">
          <div className="field">
            <label htmlFor="ws-refine">Verfeinern</label>
            <div className="refine-row">
              <input
                id="ws-refine"
                type="text"
                placeholder="z.B. Mach den Einstieg kürzer, füge mehr Gruppenarbeit ein…"
                value={refinement}
                onChange={(e) => setRefinement(e.target.value)}
                disabled={isStreaming}
                onKeyDown={(e) => { if (e.key === 'Enter' && !isStreaming) handleRefine() }}
              />
              <button
                className="refine-send"
                type="button"
                onClick={handleRefine}
                disabled={isStreaming || !refinement.trim()}
                aria-label="Verfeinern"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Beobachtungsformular */}
      {savedLessonId && students.length > 0 && (
        <ObservationsForm
          students={students}
          lessonId={savedLessonId}
          onSaved={onObservationsSaved}
        />
      )}
    </section>
  )
}
