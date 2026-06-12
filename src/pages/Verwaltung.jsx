import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClasses } from '../context/ClassesContext'
import { SCHOOL_TYPE_SHORT } from '../lib/schoolTypes'
import StudentsAdmin from '../components/admin/StudentsAdmin'
import CurriculumAdmin from '../components/admin/CurriculumAdmin'
import SettingsAdmin from '../components/admin/SettingsAdmin'
import './Verwaltung.css'

const TABS = [
  { id: 'curriculum', label: 'Lehrplan' },
  { id: 'students',   label: 'Schüler' },
  { id: 'settings',   label: 'Sonstiges' },
]

export default function Verwaltung() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState('curriculum')
  const { activeClass } = useClasses()

  // Tab aus URL-Parametern setzen (z.B. ?tab=curriculum)
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && TABS.find(t => t.id === tabParam)) {
      setTab(tabParam)
      // URL-Parameter entfernen nach Verwendung
      setSearchParams({}, { replace: true })
    }
  }, [])

  const noClassHint = tab !== 'settings' && !activeClass

  return (
    <div className="verwaltung-page">
      <header className="page-header">
        <div>
          <h1>Klasseneinstellungen</h1>
          <p className="page-subtitle">
            {activeClass
              ? `${activeClass.name}${activeClass.school_type
                  ? ' ' + (SCHOOL_TYPE_SHORT[activeClass.school_type] ?? activeClass.school_type)
                  : ''} · Jg. ${activeClass.grade}`
              : 'Klasse in der Sidebar auswählen.'}
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
            <p className="empty-state">Bitte erst eine Klasse in der Sidebar auswählen.</p>
          </div>
        ) : (
          <>
            {tab === 'students'   && <StudentsAdmin />}
            {tab === 'curriculum' && <CurriculumAdmin />}
            {tab === 'settings'   && <SettingsAdmin />}
          </>
        )}
      </div>
    </div>
  )
}
