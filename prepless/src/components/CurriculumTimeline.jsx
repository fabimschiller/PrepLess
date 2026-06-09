import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import './CurriculumTimeline.css'

const MONTH_LABELS = [
  null,
  'September',
  'Oktober',
  'November',
  'Dezember',
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
]

// September = 1, Oktober = 2, ..., Juli = 10. Ferien (Aug) ohne Schulmonat → 0.
export function getCurrentSchoolMonth(date = new Date()) {
  const m = date.getMonth() // 0..11, Jan=0
  // Sep(8)..Dez(11) → 1..4 ; Jan(0)..Jul(6) → 5..11; Aug(7) → 0
  if (m >= 8) return m - 7
  if (m <= 6) return m + 5
  return 0
}

function formatRange(start, end) {
  const a = MONTH_LABELS[start] ?? `M${start}`
  const b = MONTH_LABELS[end] ?? `M${end}`
  return start === end ? a : `${a} – ${b}`
}

function computeStatus(unit, currentMonth) {
  if (currentMonth === 0) {
    // außerhalb des Schuljahrs: alles "demnächst" außer wenn end_month <=10 schon im letzten SJ war
    return 'upcoming'
  }
  if (unit.end_month < currentMonth) return 'done'
  if (unit.start_month <= currentMonth && currentMonth <= unit.end_month) {
    return 'current'
  }
  return 'upcoming'
}

export default function CurriculumTimeline({
  classId,
  onCurrentUnitChange,
  refreshKey = 0,
}) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!classId) {
      setUnits([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase
      .from('curriculum_units')
      .select(
        'id, class_id, position, title, description, estimated_hours, start_month, end_month'
      )
      .eq('class_id', classId)
      .order('position', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) {
          setError(err.message)
          setUnits([])
        } else {
          setUnits(data ?? [])
        }
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [classId, refreshKey])

  const currentMonth = getCurrentSchoolMonth()

  const enriched = units.map((u) => ({
    ...u,
    status: computeStatus(u, currentMonth),
  }))

  const currentUnit =
    enriched.find((u) => u.status === 'current') ??
    enriched.find((u) => u.status === 'upcoming') ??
    null

  // Eltern-Komponente über aktuelle Einheit informieren
  useEffect(() => {
    if (typeof onCurrentUnitChange === 'function') {
      onCurrentUnitChange(currentUnit)
    }
    // currentUnit-Identität reicht (id), tiefer Vergleich nicht nötig
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUnit?.id])

  if (!classId) return null

  return (
    <div className="curriculum-timeline">
      <div className="curriculum-header">
        <h2>Lehrplan</h2>
        <p className="card-subtitle">
          Übersicht der Unterrichtseinheiten für dieses Schuljahr.
        </p>
      </div>

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && enriched.length === 0 && (
        <p className="empty-state">
          Noch kein Lehrplan vorhanden für diese Klasse.
        </p>
      )}

      {enriched.length > 0 && (
        <ol className="timeline">
          {enriched.map((u) => (
            <li
              key={u.id}
              className={`timeline-item status-${u.status}`}
              aria-current={u.status === 'current' ? 'true' : undefined}
            >
              <span className="timeline-dot" />
              <div className="timeline-body">
                <div className="timeline-row">
                  <span className="timeline-title">
                    {u.position}. {u.title}
                  </span>
                  <span className="timeline-meta">
                    {formatRange(u.start_month, u.end_month)} ·{' '}
                    {u.estimated_hours} h
                  </span>
                </div>
                {u.description && (
                  <p className="timeline-description">{u.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
