import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { statusFromObservation, STATUS_LABEL } from '../lib/studentStatus'
import StudentDetailModal from './StudentDetailModal'
import './StudentFocus.css'

const STATUS_ORDER = { red: 0, yellow: 1, green: 2, neutral: 3 }

export default function StudentFocus({ classId, refreshKey = 0 }) {
  const [students, setStudents] = useState([])
  const [latestByStudent, setLatestByStudent] = useState({}) // { [student_id]: { text, created_at } }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!classId) {
      setStudents([])
      setLatestByStudent({})
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
      const map = {}
      if (obs) {
        for (const o of obs) {
          if (!map[o.student_id]) {
            map[o.student_id] = { note: o.note, created_at: o.created_at }
          }
        }
      }
      setLatestByStudent(map)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [classId, refreshKey])

  const enriched = useMemo(() => {
    return students
      .map((s) => {
        const latest = latestByStudent[s.id]
        const text = latest?.note ?? s.notes ?? ''
        const status = statusFromObservation(text)
        return { ...s, latestText: text, latestAt: latest?.created_at, status }
      })
      .sort((a, b) => {
        const d = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
        if (d !== 0) return d
        return a.name.localeCompare(b.name, 'de')
      })
  }, [students, latestByStudent])

  if (!classId) return null

  return (
    <section className="student-focus card">
      <h2>Schüler im Fokus</h2>
      <p className="card-subtitle">
        Sortiert nach Förderbedarf. Klick öffnet die Beobachtungs-Historie.
      </p>

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}
      {!loading && !error && enriched.length === 0 && (
        <p className="empty-state">Noch keine Schüler in dieser Klasse.</p>
      )}

      {enriched.length > 0 && (
        <ul className="focus-list">
          {enriched.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="focus-item"
                onClick={() => setSelected(s)}
              >
                <span
                  className={`focus-dot status-${s.status}`}
                  title={STATUS_LABEL[s.status]}
                  aria-label={STATUS_LABEL[s.status]}
                />
                <span className="focus-body">
                  <span className="focus-name">{s.name}</span>
                  <span className="focus-note">
                    {s.latestText
                      ? s.latestText
                      : <em className="focus-empty">Noch keine Beobachtung</em>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <StudentDetailModal
          student={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}
