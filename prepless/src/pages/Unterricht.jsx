import { useCallback, useState } from 'react'
import { useClasses } from '../context/ClassesContext'
import CurriculumStrip from '../components/CurriculumStrip'
import LessonWorkspace from '../components/LessonWorkspace'
import StudentFocus from '../components/StudentFocus'
import './Unterricht.css'

export default function Unterricht() {
  const { activeClass } = useClasses()

  // Lehrplan-State
  const [hasUnits, setHasUnits] = useState(false)
  const [currentUnit, setCurrentUnit] = useState(null)

  // Aktiver Slot: { unit, slotIndex, lesson | null }
  const [activeSlot, setActiveSlot] = useState(null)

  // Wenn Klasse wechselt: alles zurücksetzen
  const classId = activeClass?.id ?? null

  const [savedLesson, setSavedLesson] = useState(null)
  const [updatedLesson, setUpdatedLesson] = useState(null)

  const handleSlotSelect = useCallback((slot) => {
    setActiveSlot(slot)
  }, [])

  function handleLessonSaved(lesson) {
    // Slot lokal aktualisieren: lesson in den Slot eintragen
    setSavedLesson(lesson) // CurriculumStrip liest das via ref nicht — stattdessen
    // geben wir den Slot mit dem gespeicherten Lesson zurück
    setActiveSlot((prev) =>
      prev ? { ...prev, lesson } : prev
    )
  }

  const [studentRefresh, setStudentRefresh] = useState(0)

  return (
    <div className="unterricht-page">
      <header className="unterricht-topbar">
        <div>
          <h1>{activeClass ? activeClass.name : 'Unterricht'}</h1>
          <p className="page-subtitle">
            {activeClass
              ? `${activeClass.subject} · Jahrgang ${activeClass.grade} · ${activeClass.state}`
              : 'Wähle links eine Klasse aus.'}
          </p>
        </div>
      </header>

      {!activeClass && (
        <div className="card">
          <p className="empty-state">
            Wähle in der Sidebar eine Klasse oder lege in „Verwaltung" eine neue an.
          </p>
        </div>
      )}

      {activeClass && (
        <>
          {/* Horizontale Lehrplan-Leiste mit Slot-Aufklapper */}
          <CurriculumStrip
            classId={classId}
            activeClass={activeClass}
            onCurrentUnitChange={setCurrentUnit}
            onHasUnitsChange={setHasUnits}
            onSlotSelect={handleSlotSelect}
            savedLesson={savedLesson}
            updatedLesson={updatedLesson}
          />

          {/* Zweispaltig: Arbeitsbereich + Schüler im Fokus */}
          <div className="unterricht-grid">
            <div className="unterricht-main">
              {!hasUnits ? (
                <section className="card">
                  <p className="empty-state">
                    Erzeuge zuerst einen Lehrplan über den Button oben.
                  </p>
                </section>
              ) : (
                <LessonWorkspace
                  activeClass={activeClass}
                  slot={activeSlot}
                  onLessonSaved={handleLessonSaved}
                  onLessonUpdated={setUpdatedLesson}
                  onObservationsSaved={() => setStudentRefresh((n) => n + 1)}
                />
              )}
            </div>
            <aside className="unterricht-side">
              <StudentFocus
                classId={classId}
                refreshKey={studentRefresh}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
