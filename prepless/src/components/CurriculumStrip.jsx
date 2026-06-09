import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeUnitStatus,
  generateCurriculumForClass,
  getCurrentSchoolMonth,
  monthRangeLabel,
  pickCurrentUnit,
} from '../lib/curriculum'
import ConductedModal from './ConductedModal'
import './CurriculumStrip.css'

export default function CurriculumStrip({
  classId,
  activeClass,
  refreshKey = 0,
  onCurrentUnitChange,
  onHasUnitsChange,
  onSlotSelect,
  savedLesson = null,
  // { id, status, conducted_at } – aktualisiert einen Slot-Status ohne Reload
  updatedLesson = null,
}) {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState(null)

  // Aufgeklappte Einheit
  const [expandedUnitId, setExpandedUnitId] = useState(null)
  const [userExpanded, setUserExpanded] = useState(false)

  // Modal: { lessonId, unitId }
  const [conductedModal, setConductedModal] = useState(null)
  // Schüler für Modal
  const [modalStudents, setModalStudents] = useState([])
  // Gespeicherte Stunden je Einheit: { [unit_id]: Lesson[] }
  const [lessonsByUnit, setLessonsByUnit] = useState({})
  // Aktiver Slot: { unitId, slotIndex }
  const [activeSlot, setActiveSlot] = useState(null)

  const load = useCallback(() => {
    if (!classId) { setUnits([]); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase
      .from('curriculum_units')
      .select('id, class_id, position, title, description, estimated_hours, start_month, end_month')
      .eq('class_id', classId)
      .order('position', { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setUnits([]) }
        else setUnits(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [classId])

  useEffect(() => {
    const cleanup = load()
    return cleanup
  }, [load, refreshKey])

  // Lehrplan-Stunden für eine Einheit laden
  async function loadLessonsForUnit(unitId) {
    if (lessonsByUnit[unitId]) return // bereits geladen
    const { data } = await supabase
      .from('lessons')
      .select('id, title, content, position, curriculum_unit_id')
      .eq('curriculum_unit_id', unitId)
      .order('position', { ascending: true })
    setLessonsByUnit((prev) => ({ ...prev, [unitId]: data ?? [] }))
  }

  function handleUnitClick(unit) {
    const isOpen = expandedUnitId === unit.id
    setExpandedUnitId(isOpen ? null : unit.id)
    if (!isOpen) loadLessonsForUnit(unit.id)
    setUserExpanded(true)
  }

  // Beim ersten Laden: erste Einheit automatisch aufklappen (oder die "aktuelle")
  useEffect(() => {
    if (units.length === 0) return
    if (userExpanded) return
    if (expandedUnitId) return
    const initial = pickCurrentUnit(units) ?? units[0]
    if (initial) {
      setExpandedUnitId(initial.id)
      loadLessonsForUnit(initial.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units])

  function handleSlotClick(unit, slotIndex) {
    const lessons = lessonsByUnit[unit.id] ?? []
    const lesson = lessons.find((l) => l.position === slotIndex + 1) ?? null
    const next = { unitId: unit.id, slotIndex }
    setActiveSlot(next)
    onSlotSelect?.({ unit, slotIndex, lesson })
  }

  // Slot von außen als gefüllt markieren (nach Speichern)
  function markSlotFilled(unitId, lesson) {
    setLessonsByUnit((prev) => {
      const existing = prev[unitId] ?? []
      const filtered = existing.filter((l) => l.position !== lesson.position)
      return { ...prev, [unitId]: [...filtered, lesson] }
    })
  }

  // Extern gespeicherte Stunde in den Tray eintragen
  useEffect(() => {
    if (!savedLesson?.curriculum_unit_id) return
    markSlotFilled(savedLesson.curriculum_unit_id, savedLesson)
  }, [savedLesson?.id]) // eslint-disable-line

  // Extern geänderter Status sofort im Tray aktualisieren
  useEffect(() => {
    if (!updatedLesson?.id) return
    setLessonsByUnit((prev) => {
      const next = { ...prev }
      for (const [unitId, lessons] of Object.entries(next)) {
        const idx = lessons.findIndex((l) => l.id === updatedLesson.id)
        if (idx !== -1) {
          const updated = [...lessons]
          updated[idx] = { ...updated[idx], ...updatedLesson }
          next[unitId] = updated
          break
        }
      }
      return next
    })
  }, [updatedLesson?.id, updatedLesson?.status]) // eslint-disable-line

  // hasUnits nach oben melden
  useEffect(() => {
    onHasUnitsChange?.(units.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.length > 0])

  const currentMonth = getCurrentSchoolMonth()
  const enriched = units.map((u) => ({ ...u, status: computeUnitStatus(u, currentMonth) }))
  const currentUnit = pickCurrentUnit(units)
  useEffect(() => {
    onCurrentUnitChange?.(currentUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUnit?.id])

  async function openConductedModal(lesson, unitId, e) {
    e.stopPropagation() // Slot-Klick nicht triggern
    if (!activeClass?.id) return
    const { data } = await supabase
      .from('students')
      .select('id, name')
      .eq('class_id', activeClass.id)
      .order('name', { ascending: true })
    setModalStudents(data ?? [])
    setConductedModal({ lessonId: lesson.id, unitId })
  }

  function handleConductedDone(lessonId, unitId, { status, conducted_at }) {
    // Slot-Farbe sofort aktualisieren
    setLessonsByUnit((prev) => {
      const lessons = prev[unitId] ?? []
      return {
        ...prev,
        [unitId]: lessons.map((l) =>
          l.id === lessonId ? { ...l, status, conducted_at } : l
        ),
      }
    })
    setConductedModal(null)
  }

  async function handleGenerate() {
    if (!activeClass) return
    setGenerating(true); setGenError(null)
    try {
      await generateCurriculumForClass(activeClass)
      load()
    } catch (err) {
      setGenError(err.message ?? String(err))
    } finally {
      setGenerating(false)
    }
  }

  if (!classId) return null

  return (
    <section className="curriculum-strip">
      <div className="curriculum-strip-head">
        <h3>Lehrplan</h3>
      </div>

      {loading && <p className="empty-state">Lädt…</p>}
      {error && <div className="alert error">{error}</div>}
      {genError && <div className="alert error">{genError}</div>}

      {!loading && !error && units.length === 0 && (
        <div className="strip-empty">
          {generating ? (
            <div className="loading-indicator">
              <span className="spinner" />
              <span>Lehrplan wird erzeugt…</span>
            </div>
          ) : (
            <>
              <p className="empty-state">Noch kein Lehrplan für diese Klasse.</p>
              <button type="button" className="btn-primary btn-sm" onClick={handleGenerate}>
                Lehrplan erzeugen
              </button>
            </>
          )}
        </div>
      )}

      {enriched.length > 0 && (
        <>
          {/* Horizontale Einheiten-Leiste */}
          <div className="strip-scroll">
            <ol className="strip">
              {enriched.map((u) => {
                const isExpanded = expandedUnitId === u.id
                return (
                  <li
                    key={u.id}
                    className={`strip-item status-${u.status} ${isExpanded ? 'expanded' : ''}`}
                    aria-current={u.status === 'current' ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      className="strip-item-btn"
                      onClick={() => handleUnitClick(u)}
                      aria-expanded={isExpanded}
                      title={u.title}
                    >
                      <span className="strip-dot"><span className="strip-dot-inner" /></span>
                      <span className="strip-title-row">
                        <span className="strip-title">{u.title}</span>
                        <span className="strip-chevron" aria-hidden="true">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                      </span>
                    </button>
                    <div className="strip-tooltip" role="tooltip">
                      <strong>{u.title}</strong>
                      <span className="strip-tooltip-meta">
                        {monthRangeLabel(u.start_month, u.end_month)} · {u.estimated_hours} h
                      </span>
                      {u.description && <p className="strip-tooltip-desc">{u.description}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Hinweis wenn nichts aufgeklappt */}
          {!expandedUnitId && (
            <p className="strip-hint">← Thema auswählen um Stunden zu planen</p>
          )}

          {/* Aufgeklappte Slot-Leiste */}
          {expandedUnitId && (() => {
            const unit = enriched.find((u) => u.id === expandedUnitId)
            if (!unit) return null
            const lessons = lessonsByUnit[unit.id] ?? []
            const slots = Array.from({ length: unit.estimated_hours }, (_, i) => {
              const lesson = lessons.find((l) => l.position === i + 1) ?? null
              return { index: i, lesson }
            })
            const isActive = (i) =>
              activeSlot?.unitId === unit.id && activeSlot?.slotIndex === i

            return (
              <div className="slot-tray">
                <div className="slot-tray-head">
                  <span className="slot-tray-title">{unit.title}</span>
                  <span className="slot-tray-meta">
                    {monthRangeLabel(unit.start_month, unit.end_month)} · {unit.estimated_hours} Stunden
                  </span>
                </div>
                <div className="slot-list">
                  {slots.map(({ index, lesson }) => {
                    const status = lesson?.status ?? null
                    const slotClass = lesson
                      ? status === 'conducted' ? 'slot-conducted' : 'slot-planned'
                      : 'slot-empty'
                    const slotTooltip = lesson
                      ? status === 'conducted' ? 'Durchgeführt – öffnen' : 'Geplant – öffnen'
                      : 'Stunde planen'
                    const icon = lesson
                      ? status === 'conducted' ? '✓' : '📝'
                      : '+'
                    const conducted = status === 'conducted'
                    const conductedLabel = conducted && lesson.conducted_at
                      ? `Durchgeführt am ${new Date(lesson.conducted_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                      : 'Als durchgeführt markieren'

                    return (
                      <div
                        key={index}
                        className={[
                          'slot-wrap',
                          isActive(index) ? 'slot-active' : '',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          className={['slot', slotClass].join(' ')}
                          onClick={() => handleSlotClick(unit, index)}
                          title={slotTooltip}
                        >
                          <span className="slot-icon" aria-hidden="true">{icon}</span>
                          <span className="slot-label">
                            {lesson ? lesson.title : `Stunde ${index + 1}`}
                          </span>
                        </button>

                        {/* Checkmark-Badge: nur bei gefüllten Slots */}
                        {lesson && (
                          <button
                            type="button"
                            className={[
                              'slot-check-btn',
                              conducted ? 'conducted' : '',
                            ].join(' ')}
                            title={conductedLabel}
                            disabled={conducted}
                            onClick={(e) =>
                              conducted
                                ? undefined
                                : openConductedModal(lesson, unit.id, e)
                            }
                            aria-label={conductedLabel}
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </>
      )}
      {conductedModal && (
        <ConductedModal
          lessonId={conductedModal.lessonId}
          students={modalStudents}
          onDone={(update) =>
            handleConductedDone(conductedModal.lessonId, conductedModal.unitId, update)
          }
          onClose={() => setConductedModal(null)}
        />
      )}
    </section>
  )
}
