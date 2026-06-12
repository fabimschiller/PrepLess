import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCurriculumUnits,
  getLessons,
  getStudents as getStudentsDb,
} from '../lib/db'
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
  deletedLessonId = null,
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

  // Wird gesetzt sobald der initiale Auto-Select einmalig gelaufen ist
  const autoSelectDoneRef = useRef(false)

  const load = useCallback(() => {
    if (!classId) { setUnits([]); return }
    // Klassenwechsel: alles zurücksetzen
    setUserExpanded(false)
    setExpandedUnitId(null)
    setLessonsByUnit({})
    setActiveSlot(null)
    autoSelectDoneRef.current = false

    let cancelled = false
    setLoading(true)
    setError(null)

    // Units + alle Stunden der Klasse in einem Schritt laden
    Promise.all([
      getCurriculumUnits(classId),
      getLessons(classId, 1000),
    ]).then(([unitsRes, lessonsRes]) => {
      if (cancelled) return

      const loadedUnits = unitsRes.data ?? []
      const allLessons = lessonsRes.data ?? []

      // lessonsByUnit aufbauen
      const byUnit = {}
      for (const l of allLessons) {
        if (!byUnit[l.curriculum_unit_id]) byUnit[l.curriculum_unit_id] = []
        byUnit[l.curriculum_unit_id].push(l)
      }
      setUnits(loadedUnits)
      setLessonsByUnit(byUnit)
      setLoading(false)

      if (!loadedUnits.length || !onSlotSelect) return

      // Auto-Select: zuletzt gespeicherte 'planned'-Stunde,
      // fallback auf zuletzt gespeicherte 'conducted'-Stunde,
      // fallback auf erste Einheit / Slot 0
      const candidate =
        allLessons.find((l) => l.status === 'planned') ??
        allLessons.find((l) => l.status === 'conducted') ??
        null

      if (candidate) {
        const unit = loadedUnits.find((u) => u.id === candidate.curriculum_unit_id)
        if (unit) {
          const slotIndex = candidate.position - 1
          setExpandedUnitId(unit.id)
          setActiveSlot({ unitId: unit.id, slotIndex })
          autoSelectDoneRef.current = true
          onSlotSelect({ unit, slotIndex, lesson: candidate })
          return
        }
      }

      // Fallback: keine Stunde vorhanden → erste Einheit, Slot 0
      const firstUnit = loadedUnits[0]
      if (firstUnit) {
        setExpandedUnitId(firstUnit.id)
        setActiveSlot({ unitId: firstUnit.id, slotIndex: 0 })
        autoSelectDoneRef.current = true
        onSlotSelect({ unit: firstUnit, slotIndex: 0, lesson: null })
      }
    })

    return () => { cancelled = true }
  }, [classId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cleanup = load()
    return cleanup
  }, [load, refreshKey])

  // Stunden für eine Einheit on-demand nachladen (bei manuellem Unit-Klick)
  async function loadLessonsForUnit(unitId) {
    const cached = lessonsByUnit[unitId]
    if (cached && cached.length > 0) return cached
    // Note: db.js doesn't have a function to get lessons by curriculum_unit_id
    // so we load all lessons again and filter (or use allLessons from the initial load)
    // For now, we rely on the lessons loaded in the initial Promise.all()
    // If this is called, the lessons should already be in lessonsByUnit
    return lessonsByUnit[unitId] ?? []
  }

  function handleUnitClick(unit) {
    const isOpen = expandedUnitId === unit.id
    setExpandedUnitId(isOpen ? null : unit.id)
    if (!isOpen) loadLessonsForUnit(unit.id)
    setUserExpanded(true)
  }

  function handleSlotClick(unit, slotIndex) {
    const lessons = lessonsByUnit[unit.id] ?? []
    // status + conducted_at sind durch loadLessonsForUnit bereits im Objekt
    const lesson = lessons.find((l) => l.position === slotIndex + 1) ?? null
    setActiveSlot({ unitId: unit.id, slotIndex })
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

  // Gelöschte Stunde aus dem Cache entfernen
  useEffect(() => {
    if (!deletedLessonId) return
    setLessonsByUnit((prev) => {
      const next = { ...prev }
      for (const [unitId, lessons] of Object.entries(next)) {
        next[unitId] = lessons.filter((l) => l.id !== deletedLessonId)
      }
      return next
    })
  }, [deletedLessonId])

  // hasUnits nach oben melden
  useEffect(() => {
    onHasUnitsChange?.(units.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.length > 0])

  const currentMonth = useMemo(() => getCurrentSchoolMonth(), [])
  const enriched = useMemo(
    () => units.map((u) => ({ ...u, status: computeUnitStatus(u, currentMonth) })),
    [units, currentMonth]
  )
  const currentUnit = useMemo(() => pickCurrentUnit(units), [units])
  useEffect(() => {
    onCurrentUnitChange?.(currentUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUnit?.id])

  async function openConductedModal(lesson, unitId, e) {
    e.stopPropagation() // Slot-Klick nicht triggern
    if (!activeClass?.id) return
    const { data } = await getStudentsDb(activeClass.id)
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
                           title={lesson ? lesson.title : slotTooltip}
                         >
                           {/* Icon nur für leere Slots */}
                           {!lesson && <span className="slot-icon" aria-hidden="true">{icon}</span>}
                           {/* Titel nur für gefüllte Slots, vollständig ohne Kürzung */}
                           {lesson && (
                             <span className="slot-label" title={lesson.title}>
                               {lesson.title}
                             </span>
                           )}
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
