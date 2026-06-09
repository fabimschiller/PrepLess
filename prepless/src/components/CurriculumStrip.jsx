import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeUnitStatus,
  getCurrentSchoolMonth,
  monthRangeLabel,
  pickCurrentUnit,
} from '../lib/curriculum'
import './CurriculumStrip.css'

export default function CurriculumStrip({
  classId,
  refreshKey = 0,
  onCurrentUnitChange,
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
    status: computeUnitStatus(u, currentMonth),
  }))
  const currentUnit = pickCurrentUnit(units)

  useEffect(() => {
    if (typeof onCurrentUnitChange === 'function') {
      onCurrentUnitChange(currentUnit)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUnit?.id])

  if (!classId) return null

  return (
    <section className="curriculum-strip">
      <div className="curriculum-strip-head">
        <h3>Lehrplan</h3>
        {currentUnit && (
          <span className="curriculum-strip-current">
            Aktuell: {currentUnit.title}
          </span>
        )}
      </div>

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}

      {!loading && !error && enriched.length === 0 && (
        <p className="empty-state">
          Noch kein Lehrplan vorhanden für diese Klasse.
        </p>
      )}

      {enriched.length > 0 && (
        <div className="strip-scroll">
          <ol className="strip">
            {enriched.map((u) => (
              <li
                key={u.id}
                className={`strip-item status-${u.status}`}
                aria-current={u.status === 'current' ? 'true' : undefined}
              >
                <span className="strip-dot">
                  <span className="strip-dot-inner" />
                </span>
                <span className="strip-title">{u.title}</span>
                <div className="strip-tooltip" role="tooltip">
                  <strong>{u.title}</strong>
                  <span className="strip-tooltip-meta">
                    {monthRangeLabel(u.start_month, u.end_month)} ·{' '}
                    {u.estimated_hours} h
                  </span>
                  {u.description && (
                    <p className="strip-tooltip-desc">{u.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
