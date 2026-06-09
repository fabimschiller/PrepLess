import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useClasses } from '../../context/ClassesContext'
import { generateCurriculumForClass } from '../../lib/curriculum'
import { SCHOOL_TYPES, SUBJECTS_BY_TYPE, SCHOOL_TYPE_SHORT } from '../../lib/schoolTypes'
import './AdminTables.css'

const BUNDESLAENDER = ['Bayern']

const emptyForm = {
  name: '',
  school_type: '',
  subjects: [],
  grade: '',
  state: 'Bayern',
}

// ── Fächer-Checkboxen ──────────────────────────────────────────────────────────
function SubjectCheckboxes({ schoolType, selected, onChange }) {
  const available = SUBJECTS_BY_TYPE[schoolType] ?? []
  if (!schoolType || available.length === 0) {
    return <p className="empty-state" style={{ padding: 0 }}>Bitte erst Schultyp wählen.</p>
  }
  const allSelected = available.every((s) => selected.includes(s))
  return (
    <div>
      <button
        type="button"
        className="subjects-toggle"
        onClick={() => onChange(allSelected ? [] : [...available])}
      >
        {allSelected ? 'Alle abwählen' : 'Alle auswählen'}
      </button>
      <div className="subject-checkboxes">
        {available.map((s) => (
          <label key={s} className="subject-checkbox-label">
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
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
export default function ClassesAdmin() {
  const {
    classes, loading, error,
    activeClassId, setActiveClassId,
    addClass, updateClass, removeClass,
  } = useClasses()

  const [user, setUser] = useState(null)
  const [defaultSchoolType, setDefaultSchoolType] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [curriculumLoading, setCurriculumLoading] = useState(false)

  const [editId, setEditId] = useState(null)
  const [editValues, setEditValues] = useState({})

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)
      if (!data.user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('default_school_type')
        .eq('id', data.user.id)
        .single()
      const dst = profile?.default_school_type ?? ''
      setDefaultSchoolType(dst)
      setForm((prev) => ({ ...prev, school_type: dst }))
    })
  }, [])

  function updateField(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      // Schultyp wechselt → Fächer zurücksetzen
      if (field === 'school_type') next.subjects = []
      return next
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.school_type) { setFormError('Bitte Schultyp wählen.'); return }
    if (form.subjects.length === 0) { setFormError('Bitte mindestens ein Fach wählen.'); return }
    setSaving(true); setFormError(null); setFormSuccess(null)

    if (!user) { setFormError('Kein User. Bitte neu einloggen.'); setSaving(false); return }

    const { data, error: insErr } = await supabase
      .from('classes')
      .insert({
        user_id: user.id,
        name: form.name.trim(),
        subject: form.subjects[0] ?? '',   // Rückwärtskompatibilität
        subjects: form.subjects,
        school_type: form.school_type,
        grade: form.grade.trim(),
        state: form.state,
      })
      .select()
      .single()

    setSaving(false)
    if (insErr) { setFormError(insErr.message); return }

    addClass(data)
    setActiveClassId(data.id)
    setForm({ ...emptyForm, school_type: defaultSchoolType })
    setFormSuccess(`Klasse "${data.name}" angelegt. Lehrplan wird generiert…`)

    setCurriculumLoading(true)
    try {
      await generateCurriculumForClass(data)
      setFormSuccess(`Klasse "${data.name}" inklusive Lehrplan angelegt.`)
    } catch (err) {
      setFormError(err.message ?? String(err))
    } finally {
      setCurriculumLoading(false)
    }
  }

  function startEdit(cls) {
    setEditId(cls.id)
    setEditValues({
      name: cls.name,
      school_type: cls.school_type ?? '',
      subjects: cls.subjects ?? (cls.subject ? [cls.subject] : []),
      grade: cls.grade,
      state: cls.state,
    })
  }

  function cancelEdit() { setEditId(null); setEditValues({}) }

  async function saveEdit() {
    if (!editValues.school_type) { alert('Bitte Schultyp wählen.'); return }
    const { data, error: updErr } = await supabase
      .from('classes')
      .update({
        name: editValues.name.trim(),
        subject: editValues.subjects[0] ?? editValues.name,
        subjects: editValues.subjects,
        school_type: editValues.school_type,
        grade: editValues.grade.trim(),
        state: editValues.state,
      })
      .eq('id', editId)
      .select()
      .single()
    if (updErr) { alert(updErr.message); return }
    updateClass(data)
    cancelEdit()
  }

  async function deleteClass(cls) {
    if (!confirm(`Klasse "${cls.name}" wirklich löschen?`)) return
    const { error: delErr } = await supabase.from('classes').delete().eq('id', cls.id)
    if (delErr) { alert(delErr.message); return }
    removeClass(cls.id)
    if (activeClassId === cls.id) setActiveClassId(null)
  }

  return (
    <div className="admin-block">
      <section className="card">
        <h2>Neue Klasse</h2>
        <p className="card-subtitle">Beim Anlegen wird automatisch ein Lehrplan generiert.</p>

        <form className="form" onSubmit={handleCreate}>
          <div className="admin-form-row">
            <div className="field">
              <label htmlFor="name">Klassenname</label>
              <input id="name" type="text" placeholder="z.B. 8b"
                value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="school_type">Schultyp</label>
              <select id="school_type" value={form.school_type}
                onChange={(e) => updateField('school_type', e.target.value)} required>
                <option value="">Bitte wählen…</option>
                {SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="grade">Jahrgangsstufe</label>
              <input id="grade" type="text" placeholder="z.B. 8"
                value={form.grade} onChange={(e) => updateField('grade', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="state">Bundesland</label>
              <select id="state" value={form.state}
                onChange={(e) => updateField('state', e.target.value)}>
                {BUNDESLAENDER.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Fächer dieser Klasse</label>
            <SubjectCheckboxes
              schoolType={form.school_type}
              selected={form.subjects}
              onChange={(val) => updateField('subjects', val)}
            />
          </div>

          {formError && <div className="alert error">{formError}</div>}
          {formSuccess && <div className="alert success">{formSuccess}</div>}
          {curriculumLoading && (
            <div className="loading-indicator">
              <span className="spinner" /><span>Lehrplan wird generiert…</span>
            </div>
          )}
          <button className="btn-primary" type="submit" disabled={saving}>
            {saving ? 'Speichert…' : 'Klasse anlegen'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Alle Klassen</h2>
        {loading && <p className="empty-state">Lädt…</p>}
        {error && <div className="alert error">{error}</div>}
        {!loading && classes.length === 0 && <p className="empty-state">Noch keine Klassen.</p>}

        {classes.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Schultyp</th>
                <th>Fächer</th>
                <th>Jg.</th>
                <th>Bundesland</th>
                <th className="admin-table-actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => {
                const isEditing = editId === cls.id
                const displaySubjects = cls.subjects?.length
                  ? cls.subjects.join(', ')
                  : cls.subject ?? '—'
                return (
                  <tr key={cls.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input value={editValues.name}
                            onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))} />
                        </td>
                        <td>
                          <select value={editValues.school_type}
                            onChange={(e) => setEditValues((v) => ({
                              ...v, school_type: e.target.value, subjects: [],
                            }))}>
                            <option value="">Bitte wählen…</option>
                            {SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <div style={{ marginTop: 8 }}>
                            <SubjectCheckboxes
                              schoolType={editValues.school_type}
                              selected={editValues.subjects}
                              onChange={(val) => setEditValues((v) => ({ ...v, subjects: val }))}
                            />
                          </div>
                        </td>
                        <td>
                          <input value={editValues.grade}
                            onChange={(e) => setEditValues((v) => ({ ...v, grade: e.target.value }))} />
                        </td>
                        <td>
                          <select value={editValues.state}
                            onChange={(e) => setEditValues((v) => ({ ...v, state: e.target.value }))}>
                            {BUNDESLAENDER.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </td>
                        <td></td>
                        <td className="admin-table-actions">
                          <button type="button" className="btn-primary btn-sm" onClick={saveEdit}>Speichern</button>
                          <button type="button" className="btn-secondary" onClick={cancelEdit}>Abbrechen</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{cls.name}</strong>
                          {cls.school_type && (
                            <span className="school-type-badge" style={{ marginLeft: 6 }}>
                              {SCHOOL_TYPE_SHORT[cls.school_type] ?? cls.school_type}
                            </span>
                          )}
                          {activeClassId === cls.id && <span className="badge-active">Aktiv</span>}
                        </td>
                        <td>{cls.school_type ?? '—'}</td>
                        <td className="cell-description">{displaySubjects}</td>
                        <td>{cls.grade}</td>
                        <td>{cls.state}</td>
                        <td className="admin-table-actions">
                          <button type="button" className="btn-secondary"
                            onClick={() => setActiveClassId(cls.id)}>Aktiv setzen</button>
                          <button type="button" className="btn-secondary"
                            onClick={() => startEdit(cls)}>Bearbeiten</button>
                          <button type="button" className="btn-danger"
                            onClick={() => deleteClass(cls)}>Löschen</button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
