import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClasses } from '../context/ClassesContext'
import { SCHOOL_TYPE_SHORT } from '../lib/schoolTypes'
import CurriculumStrip from '../components/CurriculumStrip'
import LessonWorkspace from '../components/LessonWorkspace'
import StudentFocus from '../components/StudentFocus'
import './Unterricht.css'

export default function Unterricht() {
  const navigate = useNavigate()
  const { activeClass } = useClasses()

  // Fach-Auswahl
  const subjects = activeClass?.subjects?.length
    ? activeClass.subjects
    : activeClass?.subject
    ? [activeClass.subject]
    : []
  const [activeSubject, setActiveSubject] = useState(subjects[0] ?? null)
  
  // Navigiere zu Verwaltung (Klasseneinstellungen) mit Lehrplan-Tab
  const goToClassSettings = () => {
    navigate(`/verwaltung?tab=curriculum`)
  }

  // Wenn Klasse wechselt: Fach zurücksetzen
  useEffect(() => {
    const subs = activeClass?.subjects?.length
      ? activeClass.subjects
      : activeClass?.subject
      ? [activeClass.subject]
      : []
    setActiveSubject(subs[0] ?? null)
  }, [activeClass?.id]) // eslint-disable-line

  const [hasUnits, setHasUnits]       = useState(false)
  const [activeSlot, setActiveSlot]   = useState(null)
  const classId = activeClass?.id ?? null

  const [savedLesson, setSavedLesson]         = useState(null)
  const [updatedLesson, setUpdatedLesson]     = useState(null)
  const [deletedLessonId, setDeletedLessonId] = useState(null)

  const handleSlotSelect = useCallback((slot) => { setActiveSlot(slot) }, [])

  function handleLessonSaved(lesson, deletedId) {
    setSavedLesson(lesson)
    if (deletedId) setDeletedLessonId(deletedId)
    setActiveSlot((prev) => prev ? { ...prev, lesson } : prev)
  }

  const [studentRefresh, setStudentRefresh] = useState(0)

  // Fach wechseln: Slot zurücksetzen
  function handleSubjectChange(subject) {
    setActiveSubject(subject)
    setActiveSlot(null)
    setHasUnits(false)
  }

  return (
    <div className="unterricht-page">
      <header className="unterricht-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1>
              {activeClass ? (
                <>
                  {activeClass.name}
                  {activeClass.school_type && (
                    <span className="school-type-badge">
                      {' '}{SCHOOL_TYPE_SHORT[activeClass.school_type] ?? activeClass.school_type}
                    </span>
                  )}
                </>
              ) : 'Unterricht'}
            </h1>
            <p className="page-subtitle">
              {activeClass
                ? `Jahrgang ${activeClass.grade} · ${activeClass.state}`
                : 'Wähle links eine Klasse aus.'}
            </p>
          </div>

          {/* Fach-Auswahl – nur wenn Klasse aktiv und mind. 1 Fach */}
          {activeClass && subjects.length > 0 && (
            <div className="subject-tabs">
              {subjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`subject-tab ${activeSubject === s ? 'active' : ''}`}
                  onClick={() => handleSubjectChange(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {!activeClass && (
        <div className="card">
          <p className="empty-state">
            Wähle in der Sidebar eine Klasse oder lege über „+ Klasse hinzufügen" eine neue an.
          </p>
        </div>
      )}

      {activeClass && (
        <>
          {/* Wenn keine Fächer: Hinweistext + Button zu Klasseneinstellungen */}
          {subjects.length === 0 ? (
            <div className="card">
              <p className="empty-state">
                Bitte zuerst Fächer für diese Klasse anlegen.
              </p>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={goToClassSettings}
                >
                  Fächer anlegen
                </button>
              </div>
            </div>
          ) : (
            <>
              <CurriculumStrip
                key={`${classId}-${activeSubject}`}
                classId={classId}
                activeSubject={activeSubject}
                activeClass={activeClass}
                onHasUnitsChange={setHasUnits}
                onSlotSelect={handleSlotSelect}
                savedLesson={savedLesson}
                updatedLesson={updatedLesson}
                deletedLessonId={deletedLessonId}
              />

              <div className="unterricht-grid">
                <div className="unterricht-main">
                  {!hasUnits ? (
                    <section className="card">
                      <p className="empty-state">
                        {activeSubject
                          ? `Noch kein Lehrplan für ${activeSubject}. Lege ihn unter Konfiguration → Lehrplan an.`
                          : 'Kein Fach ausgewählt.'}
                      </p>
                    </section>
                  ) : (
                    <LessonWorkspace
                      activeClass={activeClass}
                      activeSubject={activeSubject}
                      slot={activeSlot}
                      onLessonSaved={handleLessonSaved}
                      onLessonUpdated={setUpdatedLesson}
                      onObservationsSaved={() => setStudentRefresh((n) => n + 1)}
                    />
                  )}
                </div>
                <aside className="unterricht-side">
                  <StudentFocus classId={classId} refreshKey={studentRefresh} />
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
