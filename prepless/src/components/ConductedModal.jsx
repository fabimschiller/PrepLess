/**
 * ConductedModal
 * Öffnet sich nach "Als durchgeführt markieren".
 * Erlaubt optionale Beobachtungen pro Schüler und setzt lessons.status = 'conducted'.
 *
 * Props:
 *   lessonId   – ID der Stunde
 *   students   – Schüler-Array [{ id, name }]
 *   onDone     – fn({ status, conducted_at }) – nach erfolgreichem Speichern
 *   onClose    – Modal schließen ohne Aktion
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './ConductedModal.css'

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function ConductedModal({ lessonId, students, onDone, onClose }) {
  const [observations, setObservations] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function markConducted() {
    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('lessons')
      .update({ status: 'conducted', conducted_at: now })
      .eq('id', lessonId)
    if (updErr) throw new Error(updErr.message)
    return now
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      // Beobachtungen speichern (nur ausgefüllte)
      const rows = students
        .map((s) => ({
          student_id: s.id,
          lesson_id: lessonId,
          note: (observations[s.id] ?? '').trim(),
        }))
        .filter((r) => r.note.length > 0)

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('observations').insert(rows)
        if (insErr) throw new Error(insErr.message)
      }

      const conductedAt = await markConducted()
      onDone({ status: 'conducted', conducted_at: conductedAt })
    } catch (err) {
      setError(err.message ?? String(err))
      setSaving(false)
    }
  }

  async function handleSkip() {
    setSaving(true)
    setError(null)
    try {
      const conductedAt = await markConducted()
      onDone({ status: 'conducted', conducted_at: conductedAt })
    } catch (err) {
      setError(err.message ?? String(err))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal conducted-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Stunde durchgeführt – Beobachtungen eintragen"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>Stunde durchgeführt</h2>
            <p className="card-subtitle">
              Beobachtungen eintragen (optional) und Stunde als durchgeführt markieren.
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>

        <div className="modal-body">
          {students.length > 0 ? (
            <div className="conducted-obs-grid">
              {students.map((s) => (
                <div key={s.id} className="field">
                  <label htmlFor={`cobs-${s.id}`}>{s.name}</label>
                  <input
                    id={`cobs-${s.id}`}
                    type="text"
                    placeholder="Beobachtung (optional)…"
                    value={observations[s.id] ?? ''}
                    onChange={(e) =>
                      setObservations((p) => ({ ...p, [s.id]: e.target.value }))
                    }
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">Keine Schüler in dieser Klasse.</p>
          )}

          {error && <div className="alert error" style={{ marginTop: 12 }}>{error}</div>}
        </div>

        <footer className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleSkip}
            disabled={saving}
          >
            Überspringen
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Speichert…' : 'Speichern & Schließen'}
          </button>
        </footer>
      </div>
    </div>
  )
}
