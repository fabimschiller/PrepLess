import { useState } from 'react'
import { useClasses } from '../context/ClassesContext'
import ClassesAdmin from '../components/admin/ClassesAdmin'
import StudentsAdmin from '../components/admin/StudentsAdmin'
import CurriculumAdmin from '../components/admin/CurriculumAdmin'
import './Verwaltung.css'

const TABS = [
  { id: 'classes', label: 'Klassen' },
  { id: 'students', label: 'Schüler' },
  { id: 'curriculum', label: 'Lehrplan' },
]

export default function Verwaltung() {
  const [tab, setTab] = useState('classes')
  const { activeClass } = useClasses()

  return (
    <div className="verwaltung-page">
      <header className="page-header">
        <div>
          <h1>Verwaltung</h1>
          <p className="page-subtitle">
            Klassen, Schüler und Lehrpläne verwalten.
          </p>
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {tab === 'classes' && <ClassesAdmin />}
        {tab === 'students' && <StudentsAdmin activeClass={activeClass} />}
        {tab === 'curriculum' && <CurriculumAdmin activeClass={activeClass} />}
      </div>
    </div>
  )
}
