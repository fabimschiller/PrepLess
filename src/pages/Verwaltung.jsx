import { useState } from 'react'
import { useClasses } from '../context/ClassesContext'
import { SCHOOL_TYPE_SHORT } from '../lib/schoolTypes'
import ClassesAdmin from '../components/admin/ClassesAdmin'
import StudentsAdmin from '../components/admin/StudentsAdmin'
import CurriculumAdmin from '../components/admin/CurriculumAdmin'
import SettingsAdmin from '../components/admin/SettingsAdmin'
import './Verwaltung.css'

const TABS = [
  { id: 'classes', label: 'Klassen' },
  { id: 'students', label: 'Schüler' },
  { id: 'curriculum', label: 'Lehrplan' },
  { id: 'settings', label: 'Einstellungen' },
]

export default function Verwaltung() {
  const [tab, setTab] = useState('classes')
  const { activeClass } = useClasses()

  const noClassHint =
    tab !== 'classes' && tab !== 'settings' && !activeClass

  return (
    <div className="verwaltung-page">
      <header className="page-header">
        <div>
          <h1>Verwaltung</h1>
          <p className="page-subtitle">
            {activeClass
              ? `Aktive Klasse: ${activeClass.name}${activeClass.school_type ? ' ' + (SCHOOL_TYPE_SHORT[activeClass.school_type] ?? activeClass.school_type) : ''} · ${activeClass.school_type ?? activeClass.subject} · Jg. ${activeClass.grade}`
              : 'Klassen, Schüler und Lehrpläne verwalten.'}
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
        {noClassHint ? (
          <div className="card">
            <p className="empty-state">
              Bitte erst eine Klasse in der Sidebar auswählen.
            </p>
          </div>
        ) : (
          <>
            {tab === 'classes' && <ClassesAdmin />}
            {tab === 'students' && <StudentsAdmin />}
            {tab === 'curriculum' && <CurriculumAdmin />}
            {tab === 'settings' && <SettingsAdmin />}
          </>
        )}
      </div>
    </div>
  )
}
