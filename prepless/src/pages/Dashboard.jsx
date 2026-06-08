import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

const BUNDESLAENDER = ['Bayern']

const emptyForm = {
  name: '',
  subject: '',
  grade: '',
  state: 'Bayern',
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [classes, setClasses] = useState([])
  const [activeClassId, setActiveClassId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(null)

  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)

  // ---- Feature 1: Schüler ----
  const [students, setStudents] = useState([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentsError, setStudentsError] = useState(null)
  const [newStudentName, setNewStudentName] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)

  // ---- Feature 2: Stunde generieren ----
  const [topic, setTopic] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState(null)
  const [lessonContent, setLessonContent] = useState('')
  const [currentLessonId, setCurrentLessonId] = useState(null)
  const [observations, setObservations] = useState({}) // { [studentId]: text }
  const [savingObservations, setSavingObservations] = useState(false)
  const [observationsSuccess, setObservationsSuccess] = useState(null)
  const [observationsError, setObservationsError] = useState(null)
  // letzte Beobachtungen je Schüler (zur Mitgabe an die API)
  const [latestObservations, setLatestObservations] = useState({}) // { [studentName]: text }

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeClassId) ?? null,
    [classes, activeClassId]
  )

  // User laden
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })
  }, [])

  // Klassen laden
  const loadClasses = useCallback(async () => {
    setLoading(true)
    setListError(null)

    const { data, error } = await supabase
      .from('classes')
      .select('id, name, subject, grade, state, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setListError(error.message)
      setClasses([])
    } else {
      setClasses(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadClasses()
  }, [loadClasses])

  // Schüler der aktiven Klasse laden
  const loadStudents = useCallback(async (classId) => {
    setStudentsLoading(true)
    setStudentsError(null)

    const { data, error } = await supabase
      .from('students')
      .select('id, class_id, name, notes, created_at')
      .eq('class_id', classId)
      .order('created_at', { ascending: true })

    if (error) {
      setStudentsError(error.message)
      setStudents([])
      setStudentsLoading(false)
      return
    }

    const studentsData = data ?? []
    setStudents(studentsData)
    setStudentsLoading(false)

    // Letzte Beobachtung je Schüler holen (für API-Mitgabe)
    if (studentsData.length > 0) {
      const ids = studentsData.map((s) => s.id)
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, text, created_at')
        .in('student_id', ids)
        .order('created_at', { ascending: false })

      const latestByStudentId = {}
      if (obs) {
        for (const o of obs) {
          if (!latestByStudentId[o.student_id]) {
            latestByStudentId[o.student_id] = o.text
          }
        }
      }

      const latestByName = {}
      for (const s of studentsData) {
        latestByName[s.name] =
          latestByStudentId[s.id] ?? s.notes ?? ''
      }
      setLatestObservations(latestByName)
    } else {
      setLatestObservations({})
    }
  }, [])

  useEffect(() => {
    if (activeClassId) {
      loadStudents(activeClassId)
      // Beim Klassenwechsel: laufende Lesson-State zurücksetzen
      setTopic('')
      setLessonContent('')
      setCurrentLessonId(null)
      setObservations({})
      setObservationsSuccess(null)
      setObservationsError(null)
      setGenerationError(null)
    } else {
      setStudents([])
      setLatestObservations({})
    }
  }, [activeClassId, loadStudents])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)

    if (!user) {
      setFormError('Kein User. Bitte neu einloggen.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('classes')
      .insert({
        user_id: user.id,
        name: form.name.trim(),
        subject: form.subject.trim(),
        grade: form.grade.trim(),
        state: form.state,
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setClasses((prev) => [data, ...prev])
    setActiveClassId(data.id)
    setForm(emptyForm)
    setFormSuccess(`Klasse "${data.name}" angelegt.`)
  }

  async function handleAddStudent(e) {
    e.preventDefault()
    if (!activeClassId) return
    const name = newStudentName.trim()
    if (!name) return

    setAddingStudent(true)
    setStudentsError(null)

    const { data, error } = await supabase
      .from('students')
      .insert({
        class_id: activeClassId,
        name,
      })
      .select()
      .single()

    setAddingStudent(false)

    if (error) {
      setStudentsError(error.message)
      return
    }

    setStudents((prev) => [...prev, data])
    setLatestObservations((prev) => ({
      ...prev,
      [data.name]: data.notes ?? '',
    }))
    setNewStudentName('')
  }

  async function handleGenerateLesson() {
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
      // Auth-Session pflicht (verify_jwt = true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      if (!accessToken) {
        throw new Error('Nicht eingeloggt. Bitte neu anmelden.')
      }

      // Letzte 5 Lessons der Klasse als Titel laden (für previousLessons)
      const { data: prevLessons, error: prevErr } = await supabase
        .from('lessons')
        .select('title, generated_at')
        .eq('class_id', activeClassId)
        .order('generated_at', { ascending: false })
        .limit(5)
      if (prevErr) {
        // Nicht fatal — wir generieren trotzdem
        console.warn('Konnte vorherige Stunden nicht laden:', prevErr.message)
      }
      const previousLessons = (prevLessons ?? [])
        .map((l) => l.title)
        .filter(Boolean)

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${supabaseUrl}/functions/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          className: activeClass.name,
          subject: activeClass.subject,
          grade: activeClass.grade,
          state: activeClass.state,
          studentNames,
          studentNotes,
          topic: topic.trim(),
          previousLessons,
        }),
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(
          `Generierung fehlgeschlagen (${response.status})${errText ? `: ${errText}` : ''}`
        )
      }

      let finalContent = ''
      if (!response.body) {
        // Fallback: kein Stream
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

          // SSE: Events sind durch \n\n getrennt; jede Zeile beginnt mit "event:" oder "data:"
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
                throw new Error(
                  evt.error?.message ?? 'Anthropic-Stream-Fehler'
                )
              }
            } catch (parseErr) {
              // Ungültiges/Unbekanntes Event ignorieren, aber harte Fehler durchreichen
              if (parseErr instanceof Error && parseErr.message.startsWith('Anthropic')) {
                throw parseErr
              }
            }
          }
        }
      }

      // Titel vorschlagen: erste nicht-leere Zeile
      const computedTitle = (() => {
        const lines = finalContent.split('\n')
        for (const l of lines) {
          const t = l.replace(/^#+\s*/, '').trim()
          if (t) return t.slice(0, 120)
        }
        return `Stunde – ${activeClass.subject} (${activeClass.name})`
      })()

      await saveLessonToSupabase(finalContent, computedTitle)
    } catch (err) {
      setGenerationError(err.message ?? String(err))
    } finally {
      setGenerating(false)
    }
  }

  async function saveLessonToSupabase(content, title) {
    if (!activeClassId || !content || !content.trim()) return

    const { data, error } = await supabase
      .from('lessons')
      .insert({
        class_id: activeClassId,
        title,
        content,
      })
      .select()
      .single()

    if (error) {
      setGenerationError(`Stunde konnte nicht gespeichert werden: ${error.message}`)
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
        text: (observations[s.id] ?? '').trim(),
      }))
      .filter((r) => r.text.length > 0)

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

    // Lokal die "letzte Beobachtung" je Schüler aktualisieren
    setLatestObservations((prev) => {
      const next = { ...prev }
      for (const s of students) {
        const t = (observations[s.id] ?? '').trim()
        if (t) next[s.name] = t
      }
      return next
    })

    setObservationsSuccess('Beobachtungen gespeichert.')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-brand">PrepLess</div>
        <div className="dashboard-user">
          {user?.email && (
            <span className="dashboard-user-email">{user.email}</span>
          )}
          <button className="dashboard-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="card">
          <h2>Meine Klassen</h2>
          <p className="card-subtitle">
            Wähle eine Klasse aus, um sie als aktive Klasse zu markieren.
          </p>

          {loading ? (
            <p className="empty-state">Lädt…</p>
          ) : listError ? (
            <div className="alert error">{listError}</div>
          ) : classes.length === 0 ? (
            <p className="empty-state">
              Noch keine Klassen. Lege rechts deine erste an.
            </p>
          ) : (
            <ul className="class-list">
              {classes.map((cls) => {
                const isActive = cls.id === activeClassId
                return (
                  <li key={cls.id}>
                    <button
                      type="button"
                      className={`class-item ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveClassId(cls.id)}
                    >
                      <span className="class-item-main">
                        <span className="class-item-name">{cls.name}</span>
                        <span className="class-item-meta">
                          {cls.subject} · Jahrgang {cls.grade} · {cls.state}
                        </span>
                      </span>
                      {isActive && (
                        <span className="class-item-badge">Aktiv</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Neue Klasse</h2>
          <p className="card-subtitle">Lege eine neue Klasse an.</p>

          <form className="form" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                placeholder="z.B. 8b"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="subject">Fach</label>
              <input
                id="subject"
                type="text"
                placeholder="z.B. Mathematik"
                value={form.subject}
                onChange={(e) => updateField('subject', e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="grade">Jahrgang</label>
              <input
                id="grade"
                type="text"
                placeholder="z.B. 8"
                value={form.grade}
                onChange={(e) => updateField('grade', e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="state">Bundesland</label>
              <select
                id="state"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
              >
                {BUNDESLAENDER.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {formError && <div className="alert error">{formError}</div>}
            {formSuccess && <div className="alert success">{formSuccess}</div>}

            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Speichert…' : 'Klasse anlegen'}
            </button>
          </form>
        </section>

        {activeClass && (
          <>
            <section className="card card-wide">
              <h2>Schüler – {activeClass.name}</h2>
              <p className="card-subtitle">
                Verwalte die Schülerinnen und Schüler dieser Klasse.
              </p>

              <form className="inline-form" onSubmit={handleAddStudent}>
                <input
                  type="text"
                  placeholder="Name des Schülers"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  required
                />
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={addingStudent || !newStudentName.trim()}
                >
                  {addingStudent ? 'Fügt hinzu…' : 'Hinzufügen'}
                </button>
              </form>

              {studentsError && (
                <div className="alert error" style={{ marginTop: 12 }}>
                  {studentsError}
                </div>
              )}

              {studentsLoading ? (
                <p className="empty-state">Lädt…</p>
              ) : students.length === 0 ? (
                <p className="empty-state">
                  Noch keine Schüler. Füge oben den ersten hinzu.
                </p>
              ) : (
                <ul className="student-list">
                  {students.map((s) => (
                    <li key={s.id} className="student-item">
                      <div className="student-item-main">
                        <span className="student-item-name">{s.name}</span>
                        {s.notes && (
                          <span className="student-item-notes">{s.notes}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card card-wide">
              <div className="card-row">
                <div>
                  <h2>Stunde generieren</h2>
                  <p className="card-subtitle">
                    Generiere eine Unterrichtsstunde für „{activeClass.name}“
                    ({activeClass.subject}, Jahrgang {activeClass.grade}).
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
                    disabled={generating}
                  />
                </div>
                <button
                  className="btn-primary generate-btn"
                  type="button"
                  onClick={handleGenerateLesson}
                  disabled={generating || !topic.trim()}
                >
                  {generating ? 'Generiert…' : 'Stunde generieren'}
                </button>
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
                <form
                  className="observations-form"
                  onSubmit={handleSaveObservations}
                >
                  <h3>Beobachtungen</h3>
                  <p className="card-subtitle">
                    Halte für jeden Schüler eine kurze Beobachtung aus dieser
                    Stunde fest.
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
                          onChange={(e) =>
                            updateObservation(s.id, e.target.value)
                          }
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
                    {savingObservations
                      ? 'Speichert…'
                      : 'Beobachtungen speichern'}
                  </button>
                </form>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
