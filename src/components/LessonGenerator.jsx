import { useEffect, useState } from 'react'
import { getSession } from '../lib/auth'
import { getStudentsByClass, getObservationsByStudentIds, createObservations, getLessons } from '../lib/db'
import { generateLesson } from '../lib/api'
import './LessonGenerator.css'

export default function LessonGenerator({
  activeClass,
  currentUnit,
  hasUnits,
  onObservationsSaved,
}) {
  const [topic, setTopic] = useState('')
  const [topicSuggestion, setTopicSuggestion] = useState('')

  const [students, setStudents] = useState([])
  const [latestObservations, setLatestObservations] = useState({}) // {name: text}

  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState(null)
  const [lessonContent, setLessonContent] = useState('')
  const [currentLessonId, setCurrentLessonId] = useState(null)

  const [observations, setObservations] = useState({}) // {studentId: text}
  const [savingObservations, setSavingObservations] = useState(false)
  const [observationsError, setObservationsError] = useState(null)
  const [observationsSuccess, setObservationsSuccess] = useState(null)

  // Schüler + letzte Beobachtungen laden (für Generator-Payload + Observation-Form)
  useEffect(() => {
    if (!activeClass?.id) {
      setStudents([])
      setLatestObservations({})
      return
    }

    let cancelled = false
    ;(async () => {
      const { data: studentsData } = await getStudentsByClass(activeClass.id, 'created_at')

      if (cancelled) return
      const list = studentsData ?? []
      setStudents(list)

      if (list.length === 0) {
        setLatestObservations({})
        return
      }
      const ids = list.map((s) => s.id)
      const { data: obs } = await getObservationsByStudentIds(ids)

      if (cancelled) return
      const latestByStudentId = {}
      if (obs) {
        for (const o of obs) {
          if (!latestByStudentId[o.student_id]) {
            latestByStudentId[o.student_id] = o.note
          }
        }
      }
      const latestByName = {}
      for (const s of list) {
        latestByName[s.name] = latestByStudentId[s.id] ?? s.notes ?? ''
      }
      setLatestObservations(latestByName)
    })()

    return () => {
      cancelled = true
    }
  }, [activeClass?.id])

  // Topic vorbefüllen wenn currentUnit wechselt (User-Edits respektieren)
  useEffect(() => {
    const next = currentUnit?.title ?? ''
    setTopic((prev) => {
      if (!prev || prev === topicSuggestion) return next
      return prev
    })
    setTopicSuggestion(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUnit?.id])

  // Reset bei Klassenwechsel
  useEffect(() => {
    setLessonContent('')
    setCurrentLessonId(null)
    setObservations({})
    setObservationsError(null)
    setObservationsSuccess(null)
    setGenerationError(null)
  }, [activeClass?.id])

  async function handleGenerate() {
    if (!activeClass) return
    if (!topic.trim()) {
      setGenerationError('Bitte ein Thema für die Stunde angeben.')
      return
    }

    setGenerating(true)
    setGenerationError(null)
    setLessonContent('')
    setCurrentLessonId(null)
    setObservations({})
    setObservationsSuccess(null)
    setObservationsError(null)

    const studentNames = students.map((s) => s.name)
    const studentNotes = {}
    for (const s of students) {
      studentNotes[s.name] = latestObservations[s.name] ?? s.notes ?? ''
    }

    try {
      const { data: prevLessons } = await getLessons(activeClass.id, 5)
      const previousLessons = (prevLessons ?? [])
        .map((l) => l.title)
        .filter(Boolean)

      const controller = new AbortController()

      const { response } = await generateLesson(
        {
          className: activeClass.name,
          subject: activeClass.subject,
          grade: activeClass.grade,
          state: activeClass.state,
          topic: topic.trim(),
          previousLessons,
        },
        controller.signal
      )
        body: JSON.stringify({
          className: activeClass.name,
          subject: activeClass.subject,
          grade: activeClass.grade,
          state: activeClass.state,
          studentNames,
          studentNotes,
          topic: topic.trim(),
          previousLessons,
          curriculumUnitTitle: currentUnit?.title ?? '',
          curriculumUnitDescription: currentUnit?.description ?? '',
        }),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(
          `Generierung fehlgeschlagen (${response.status})${
            errText ? `: ${errText}` : ''
          }`
        )
      }

      let finalContent = ''
      if (!response.body) {
        finalContent = await response.text()
        setLessonContent(finalContent)
      } else {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let sepIndex
          while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex)
            buffer = buffer.slice(sepIndex + 2)

            const dataLines = rawEvent
              .split('\n')
              .filter((l) => l.startsWith('data:'))
              .map((l) => l.slice(5).trimStart())
            if (dataLines.length === 0) continue
            const dataStr = dataLines.join('\n')
            if (dataStr === '[DONE]') continue

            try {
              const evt = JSON.parse(dataStr)
              if (
                evt.type === 'content_block_delta' &&
                evt.delta?.type === 'text_delta' &&
                typeof evt.delta.text === 'string'
              ) {
                finalContent += evt.delta.text
                setLessonContent(finalContent)
              } else if (evt.type === 'error') {
                throw new Error(evt.error?.message ?? 'Anthropic-Stream-Fehler')
              }
            } catch (parseErr) {
              if (
                parseErr instanceof Error &&
                parseErr.message.startsWith('Anthropic')
              ) {
                throw parseErr
              }
            }
          }
        }
      }

      const computedTitle = (() => {
        const lines = finalContent.split('\n')
        for (const l of lines) {
          const t = l.replace(/^#+\s*/, '').trim()
          if (t) return t.slice(0, 120)
        }
        return `Stunde – ${activeClass.subject} (${activeClass.name})`
      })()

      await saveLesson(finalContent, computedTitle)
    } catch (err) {
      setGenerationError(err.message ?? String(err))
    } finally {
      setGenerating(false)
    }
  }

  async function saveLesson(content, title) {
    if (!activeClass?.id || !content || !content.trim()) return
    const { data, error } = await supabase
      .from('lessons')
      .insert({ class_id: activeClass.id, title, content })
      .select()
      .single()
    if (error) {
      setGenerationError(
        `Stunde konnte nicht gespeichert werden: ${error.message}`
      )
      return
    }
    setCurrentLessonId(data.id)
  }

  function updateObservation(studentId, text) {
    setObservations((prev) => ({ ...prev, [studentId]: text }))
  }

  async function handleSaveObservations(e) {
    e.preventDefault()
    if (!currentLessonId) {
      setObservationsError('Keine gespeicherte Stunde vorhanden.')
      return
    }
    setSavingObservations(true)
    setObservationsError(null)
    setObservationsSuccess(null)

    const rows = students
      .map((s) => ({
        lesson_id: currentLessonId,
        student_id: s.id,
        note: (observations[s.id] ?? '').trim(),
      }))
      .filter((r) => r.note.length > 0)

    if (rows.length === 0) {
      setSavingObservations(false)
      setObservationsError('Bitte mindestens eine Beobachtung eintragen.')
      return
    }

    const { error } = await supabase.from('observations').insert(rows)
    setSavingObservations(false)
    if (error) {
      setObservationsError(error.message)
      return
    }

    // Lokale "letzte Beobachtung" aktualisieren
    setLatestObservations((prev) => {
      const next = { ...prev }
      for (const s of students) {
        const t = (observations[s.id] ?? '').trim()
        if (t) next[s.name] = t
      }
      return next
    })

    setObservationsSuccess('Beobachtungen gespeichert.')
    onObservationsSaved?.()
  }

  if (!activeClass) {
    return (
      <section className="card">
        <h2>Stunde generieren</h2>
        <p className="card-subtitle">
          Bitte oben eine Klasse auswählen, um eine Stunde zu generieren.
        </p>
      </section>
    )
  }

  return (
    <section className="card lesson-generator">
      <div className="card-row">
        <div>
          <h2>Stunde generieren</h2>
          <p className="card-subtitle">
            Generiert eine 45-min Unterrichtsstunde für „{activeClass.name}"
            ({activeClass.subject}, Jg. {activeClass.grade}).
          </p>
        </div>
      </div>

      <div className="generate-controls">
        <div className="field generate-topic">
          <label htmlFor="topic">Thema der Stunde</label>
          <input
            id="topic"
            type="text"
            placeholder="z.B. Lineare Funktionen – Steigung"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={generating || !hasUnits}
          />
          {currentUnit && topic === topicSuggestion && (
            <span className="generate-hint">
              Vorschlag aus aktueller Lehrplan-Einheit – editierbar.
            </span>
          )}
        </div>
        <div
          title={!hasUnits ? 'Erst Lehrplan erzeugen' : undefined}
          className="generate-btn-wrapper"
        >
          <button
            className="btn-primary generate-btn"
            type="button"
            onClick={handleGenerate}
            disabled={generating || !topic.trim() || !hasUnits}
          >
            {generating ? 'Generiert…' : 'Stunde generieren'}
          </button>
        </div>
      </div>

      {generationError && (
        <div className="alert error" style={{ marginTop: 12 }}>
          {generationError}
        </div>
      )}

      {(generating || lessonContent) && (
        <div className="lesson-output">
          {generating && !lessonContent && (
            <div className="loading-indicator">
              <span className="spinner" />
              <span>Stunde wird generiert…</span>
            </div>
          )}
          {lessonContent && (
            <pre className="lesson-content">
              {lessonContent}
              {generating && <span className="caret">▍</span>}
            </pre>
          )}
        </div>
      )}

      {currentLessonId && students.length > 0 && (
        <form className="observations-form" onSubmit={handleSaveObservations}>
          <h3>Beobachtungen</h3>
          <p className="card-subtitle">
            Halte für jeden Schüler eine kurze Beobachtung aus dieser Stunde
            fest.
          </p>

          <div className="observation-list">
            {students.map((s) => (
              <div key={s.id} className="field">
                <label htmlFor={`obs-${s.id}`}>{s.name}</label>
                <textarea
                  id={`obs-${s.id}`}
                  rows={2}
                  placeholder="Beobachtung…"
                  value={observations[s.id] ?? ''}
                  onChange={(e) => updateObservation(s.id, e.target.value)}
                />
              </div>
            ))}
          </div>

          {observationsError && (
            <div className="alert error">{observationsError}</div>
          )}
          {observationsSuccess && (
            <div className="alert success">{observationsSuccess}</div>
          )}

          <button
            className="btn-primary"
            type="submit"
            disabled={savingObservations}
          >
            {savingObservations ? 'Speichert…' : 'Beobachtungen speichern'}
          </button>
        </form>
      )}
    </section>
  )
}
