import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { signOut } from '../lib/auth'
import { getUser } from '../lib/auth'
import { createClass } from '../lib/db'
import { useClasses } from '../context/ClassesContext'
import { generateCurriculumForClass } from '../lib/curriculum'
import { SCHOOL_TYPE_SHORT, SCHOOL_TYPES, SUBJECTS_BY_TYPE } from '../lib/schoolTypes'
import './AppLayout.css'

const NAV_ITEMS = [
  { to: '/unterricht', label: 'Unterricht' },
  { to: '/verwaltung', label: 'Verwaltung' },
  { to: '/mein-lernen', label: 'Mein Lernen' },
]

const DOT_COLORS = ['#aa3bff', '#2563eb', '#16a34a', '#d99b1f', '#d12d2d']

const emptyForm = { name: '', school_type: '', subjects: [], grade: '', state: 'Bayern' }

function SubjectCheckboxes({ schoolType, selected, onChange }) {
  const available = SUBJECTS_BY_TYPE[schoolType] ?? []
  if (!schoolType || available.length === 0)
    return <p className="sidebar-empty">Erst Schultyp wählen.</p>
  return (
    <div className="subject-checkboxes-mini">
      {available.map((s) => (
        <label key={s} className="subject-checkbox-label-mini">
          <input
            type="checkbox"
            checked={selected.includes(s)}
            onChange={(e) => {
              if (e.target.checked) onChange([...selected, s])
              else onChange(selected.filter((x) => x !== s))
            }}
          />
          {s}
        </label>
      ))}
    </div>
  )
}

export default function AppLayout({ user }) {
  const { classes, activeClassId, setActiveClassId, loading, addClass } = useClasses()
  const navigate = useNavigate()

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  function updateField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'school_type') next.subjects = []
      return next
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.school_type) { setFormError('Schultyp wählen.'); return }
    if (form.subjects.length === 0) { setFormError('Mind. ein Fach wählen.'); return }
    setSaving(true); setFormError(null)

    const { data: userData } = await getUser()
    if (!userData?.user) { setFormError('Nicht eingeloggt.'); setSaving(false); return }

    const { data, error: insErr } = await createClass(userData.user.id, form)
    if (insErr) { setFormError(insErr.message); setSaving(false); return }

    addClass(data)
    setActiveClassId(data.id)
    setForm(emptyForm)
    setShowAddForm(false)
    setSaving(false)

    // Lehrplan im Hintergrund generieren
    generateCurriculumForClass(data).catch(() => {})
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          PrepLess
          <span className="sidebar-tagline">Prepare Less. Teach More.</span>
        </div>

        {/* Klassen-Liste */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Meine Klassen</div>
          {loading && <p className="sidebar-empty">Lädt…</p>}
          {!loading && classes.length === 0 && (
            <p className="sidebar-empty">Noch keine Klassen.</p>
          )}
          {!loading && classes.length > 0 && (
            <ul className="sidebar-class-list">
              {classes.map((cls, i) => {
                const isActive = cls.id === activeClassId
                return (
                  <li key={cls.id}>
                    <button
                      type="button"
                      className={`sidebar-class-item ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveClassId(cls.id)}
                    >
                      <span
                        className="sidebar-class-dot"
                        style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
                      />
                      <span className="sidebar-class-label">
                        <span className="sidebar-class-name">
                          {cls.name}
                          {cls.school_type && (
                            <span className="school-type-badge">
                              {' '}{SCHOOL_TYPE_SHORT[cls.school_type] ?? cls.school_type}
                            </span>
                          )}
                        </span>
                        <span className="sidebar-class-meta">
                          {cls.school_type
                            ? `${cls.school_type} · Jg. ${cls.grade}`
                            : `Jg. ${cls.grade}`}
                        </span>
                        {(cls.subjects?.length > 0 || cls.subject) && (
                          <span className="sidebar-class-subjects">
                            {cls.subjects?.length > 0
                              ? cls.subjects.join(', ')
                              : cls.subject}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Klasse hinzufügen */}
          {!showAddForm ? (
            <button
              type="button"
              className="sidebar-add-class-btn"
              onClick={() => setShowAddForm(true)}
            >
              + Klasse hinzufügen
            </button>
          ) : (
            <form className="sidebar-add-form" onSubmit={handleCreate}>
              <div className="field">
                <input
                  type="text"
                  placeholder="Klassenname (z.B. 8b)"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <select
                  value={form.school_type}
                  onChange={(e) => updateField('school_type', e.target.value)}
                  required
                >
                  <option value="">Schultyp wählen…</option>
                  {SCHOOL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <input
                  type="text"
                  placeholder="Jahrgang (z.B. 8)"
                  value={form.grade}
                  onChange={(e) => updateField('grade', e.target.value)}
                  required
                />
              </div>
              {form.school_type && (
                <div className="field">
                  <div className="sidebar-section-title" style={{ marginBottom: 4 }}>Fächer</div>
                  <SubjectCheckboxes
                    schoolType={form.school_type}
                    selected={form.subjects}
                    onChange={(val) => updateField('subjects', val)}
                  />
                </div>
              )}
              {formError && (
                <p style={{ color: 'var(--error, #d12d2d)', fontSize: 12, margin: '4px 0' }}>
                  {formError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary" type="submit" disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Anlegen…' : 'Anlegen'}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => { setShowAddForm(false); setForm(emptyForm); setFormError(null) }}
                  disabled={saving}
                >
                  ✕
                </button>
              </div>
            </form>
          )}
        </div>

        <hr className="sidebar-divider" />

        {/* Navigation */}
        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <hr className="sidebar-divider" />

        {/* Footer */}
        <div className="sidebar-footer">
          {user?.email && (
            <div className="sidebar-user-email" title={user.email}>
              {user.email}
            </div>
          )}
          <button className="sidebar-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
