import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { statusFromObservation, STATUS_LABEL } from '../lib/studentStatus'
import StudentDetailModal from './StudentDetailModal'
import './StudentFocus.css'

const STATUS_ORDER = { red: 0, yellow: 1, green: 2, neutral: 3 }

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── Icon-Komponenten ─────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

// ─── Beobachtungs-Historie (Inline-Panel) ─────────────────────────────────────

function HistoryPanel({ student, onClose }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('observations')
      .select('id, note, created_at, lessons(title)')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        else setEntries(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [student.id])

  return (
    <div className="focus-panel" ref={ref} role="dialog"
      aria-label={`Beobachtungen: ${student.name}`}>
      <div className="focus-panel-head">
        <span className="focus-panel-title">
          Letzte Beobachtungen – {student.name}
        </span>
        <button type="button" className="focus-panel-close" onClick={onClose}
          aria-label="Schließen">×</button>
      </div>
      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}
      {!loading && !error && entries.length === 0 && (
        <p className="empty-state">Noch keine Beobachtungen.</p>
      )}
      {entries.length > 0 && (
        <ul className="focus-panel-list">
          {entries.map((e) => (
            <li key={e.id} className="focus-panel-entry">
              <div className="focus-panel-entry-head">
                <span className="focus-panel-date">{formatDate(e.created_at)}</span>
                {e.lessons?.title && (
                  <span className="focus-panel-lesson">{e.lessons.title}</span>
                )}
              </div>
              <p className="focus-panel-note">{e.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Inline-Formular für neue Beobachtung ─────────────────────────────────────

function AddObservationForm({ student, onSaved, onCancel }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const text = note.trim()
    if (!text) return
    setSaving(true)
    setError(null)

    const { data, error: insErr } = await supabase
      .from('observations')
      .insert({
        student_id: student.id,
        note: text,
        lesson_id: null,
      })
      .select('id, note, created_at')
      .single()

    setSaving(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    onSaved(data)
  }

  return (
    <form className="focus-add-form" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type="text"
        className="focus-add-input"
        placeholder="Beobachtung eintragen…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={saving}
      />
      <div className="focus-add-actions">
        {error && <span className="focus-add-error">{error}</span>}
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Abbrechen
        </button>
        <button
          type="submit"
          className="btn-primary btn-sm"
          disabled={saving || !note.trim()}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function StudentFocus({ classId, refreshKey = 0 }) {
  const [students, setStudents] = useState([])
  const [latestByStudent, setLatestByStudent] = useState({})  // { [id]: { note, created_at } }
  const [countByStudent, setCountByStudent] = useState({})    // { [id]: number }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Welches Panel/Formular gerade offen ist (jeweils nur eines)
  const [historyOpen, setHistoryOpen] = useState(null)   // student.id
  const [addOpen, setAddOpen] = useState(null)           // student.id
  const [modalStudent, setModalStudent] = useState(null) // Vollbild-Modal

  useEffect(() => {
    if (!classId) {
      setStudents([])
      setLatestByStudent({})
      setCountByStudent({})
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      const { data: studentsData, error: sErr } = await supabase
        .from('students')
        .select('id, class_id, name, notes, created_at')
        .eq('class_id', classId)
        .order('name', { ascending: true })

      if (cancelled) return
      if (sErr) {
        setError(sErr.message)
        setStudents([])
        setLatestByStudent({})
        setLoading(false)
        return
      }

      const list = studentsData ?? []
      setStudents(list)

      if (list.length === 0) {
        setLatestByStudent({})
        setLoading(false)
        return
      }

      const ids = list.map((s) => s.id)
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, note, created_at')
        .in('student_id', ids)
        .order('created_at', { ascending: false })

      if (cancelled) return
      const latestMap = {}
      const countMap = {}
      if (obs) {
        for (const o of obs) {
          if (!latestMap[o.student_id]) {
            latestMap[o.student_id] = { note: o.note, created_at: o.created_at }
          }
          countMap[o.student_id] = (countMap[o.student_id] ?? 0) + 1
        }
      }
      setLatestByStudent(latestMap)
      setCountByStudent(countMap)
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [classId, refreshKey])

  const enriched = useMemo(() => {
    return students
      .map((s) => {
        const latest = latestByStudent[s.id]
        const text = latest?.note ?? s.notes ?? ''
        const count = countByStudent[s.id] ?? 0
        const status = statusFromObservation(text)
        return { ...s, latestText: text, latestAt: latest?.created_at, count, status }
      })
      .sort((a, b) => {
        // Primär: Anzahl absteigend (Schüler ohne Beobachtungen ans Ende)
        if (b.count !== a.count) return b.count - a.count
        // Sekundär: alphabetisch
        return a.name.localeCompare(b.name, 'de')
      })
  }, [students, latestByStudent, countByStudent])

  function handleObservationSaved(student, data) {
    setLatestByStudent((prev) => ({
      ...prev,
      [student.id]: { note: data.note, created_at: data.created_at },
    }))
    setCountByStudent((prev) => ({
      ...prev,
      [student.id]: (prev[student.id] ?? 0) + 1,
    }))
    setAddOpen(null)
  }

  function toggleHistory(id) {
    setAddOpen(null)
    setHistoryOpen((prev) => (prev === id ? null : id))
  }

  function toggleAdd(id) {
    setHistoryOpen(null)
    setAddOpen((prev) => (prev === id ? null : id))
  }

  if (!classId) return null

  return (
    <section className="student-focus card">
      <h2>Schülerbeobachtungen</h2>
      <p className="card-subtitle">
        Sortiert nach Anzahl der Beobachtungen.
      </p>

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}
      {!loading && !error && enriched.length === 0 && (
        <p className="empty-state">Noch keine Schüler in dieser Klasse.</p>
      )}

      {enriched.length > 0 && (
        <ul className="focus-list">
          {enriched.map((s) => (
            <li key={s.id} className="focus-entry">
              {/* ── Schüler-Zeile ── */}
              <div className="focus-item">
                <span
                  className={`focus-dot status-${s.status}`}
                  title={STATUS_LABEL[s.status]}
                  aria-label={STATUS_LABEL[s.status]}
                />
                <span className="focus-body">
                  <span className="focus-name">
                    {s.name}
                    {' '}
                    <span className={`focus-count ${s.count === 0 ? 'focus-count-zero' : ''}`}>
                      ({s.count})
                    </span>
                  </span>
                  <span className="focus-note">
                    {s.latestText
                      ? s.latestText
                      : <em className="focus-empty">Noch keine Beobachtungen</em>}
                  </span>
                </span>

                {/* ── Icon-Buttons ── */}
                <span className="focus-actions">
                  <button
                    type="button"
                    className={`focus-icon-btn ${historyOpen === s.id ? 'active' : ''}`}
                    onClick={() => toggleHistory(s.id)}
                    title="Beobachtungs-Historie"
                    aria-label="Beobachtungs-Historie anzeigen"
                  >
                    <EyeIcon />
                  </button>
                  <button
                    type="button"
                    className={`focus-icon-btn ${addOpen === s.id ? 'active' : ''}`}
                    onClick={() => toggleAdd(s.id)}
                    title="Beobachtung eintragen"
                    aria-label="Beobachtung eintragen"
                  >
                    <PlusIcon />
                  </button>
                </span>
              </div>

              {/* ── History-Panel ── */}
              {historyOpen === s.id && (
                <HistoryPanel
                  student={s}
                  onClose={() => setHistoryOpen(null)}
                />
              )}

              {/* ── Inline-Formular ── */}
              {addOpen === s.id && (
                <AddObservationForm
                  student={s}
                  onSaved={(data) => handleObservationSaved(s, data)}
                  onCancel={() => setAddOpen(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Vollbild-Modal (legacy, falls noch genutzt) */}
      {modalStudent && (
        <StudentDetailModal
          student={modalStudent}
          onClose={() => setModalStudent(null)}
        />
      )}
    </section>
  )
}
