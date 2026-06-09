import { useState } from 'react'
import { useClasses } from '../context/ClassesContext'
import CurriculumStrip from '../components/CurriculumStrip'
import LessonGenerator from '../components/LessonGenerator'
import StudentFocus from '../components/StudentFocus'
import './Unterricht.css'

export default function Unterricht() {
  const { activeClass } = useClasses()
  const [currentUnit, setCurrentUnit] = useState(null)
  const [studentRefresh, setStudentRefresh] = useState(0)

  return (
    <div className="unterricht-page">
      <header className="unterricht-topbar">
        <div>
          <h1>
            {activeClass ? activeClass.name : 'Unterricht'}
          </h1>
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
          <CurriculumStrip
            classId={activeClass.id}
            onCurrentUnitChange={setCurrentUnit}
          />

          <div className="unterricht-grid">
            <div className="unterricht-main">
              <LessonGenerator
                activeClass={activeClass}
                currentUnit={currentUnit}
                onObservationsSaved={() => setStudentRefresh((n) => n + 1)}
              />
            </div>
            <aside className="unterricht-side">
              <StudentFocus
                classId={activeClass.id}
                refreshKey={studentRefresh}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
