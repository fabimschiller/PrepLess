import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './StudentDetailModal.css'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function StudentDetailModal({ student, onClose }) {
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('observations')
      .select('id, note, created_at, lesson_id, lessons(title)')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setObservations([])
        } else {
          setObservations(data ?? [])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [student.id])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Details zu ${student.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{student.name}</h2>
            {student.notes && (
              <p className="card-subtitle">{student.notes}</p>
            )}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <h3>Beobachtungs-Historie</h3>
          {loading && <p className="empty-state">Lädt…</p>}
          {error && <div className="alert error">{error}</div>}
          {!loading && !error && observations.length === 0 && (
            <p className="empty-state">
              Noch keine Beobachtungen für diesen Schüler.
            </p>
          )}
          {observations.length > 0 && (
            <ul className="obs-history">
              {observations.map((o) => (
                <li key={o.id}>
                  <div className="obs-history-head">
                    <span className="obs-history-date">
                      {formatDate(o.created_at)}
                    </span>
                    {o.lessons?.title && (
                      <span className="obs-history-lesson">
                        {o.lessons.title}
                      </span>
                    )}
                  </div>
                  <p className="obs-history-text">{o.note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
