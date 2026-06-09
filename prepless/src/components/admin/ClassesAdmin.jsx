import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useClasses } from '../../context/ClassesContext'
import { generateCurriculumForClass } from '../../lib/curriculum'
import './AdminTables.css'

const BUNDESLAENDER = ['Bayern']

const emptyForm = {
  name: '',
  subject: '',
  grade: '',
  state: 'Bayern',
}

export default function ClassesAdmin() {
  const {
    classes,
    loading,
    error,
    activeClassId,
    setActiveClassId,
    addClass,
    updateClass,
    removeClass,
  } = useClasses()

  const [user, setUser] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [curriculumLoading, setCurriculumLoading] = useState(false)

  const [editId, setEditId] = useState(null)
  const [editValues, setEditValues] = useState({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setFormSuccess(null)

    if (!user) {
      setFormError('Kein User. Bitte neu einloggen.')
      setSaving(false)
      return
    }

    const { data, error: insErr } = await supabase
      .from('classes')
      .insert({
        user_id: user.id,
        name: form.name.trim(),
        subject: form.subject.trim(),
        grade: form.grade.trim(),
        state: form.state,
      })
      .select()
      .single()

    setSaving(false)

    if (insErr) {
      setFormError(insErr.message)
      return
    }

    addClass(data)
    setActiveClassId(data.id)
    setForm(emptyForm)
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
      subject: cls.subject,
      grade: cls.grade,
      state: cls.state,
    })
  }

  function cancelEdit() {
    setEditId(null)
    setEditValues({})
  }

  async function saveEdit() {
    const { data, error: updErr } = await supabase
      .from('classes')
      .update({
        name: editValues.name.trim(),
        subject: editValues.subject.trim(),
        grade: editValues.grade.trim(),
        state: editValues.state,
      })
      .eq('id', editId)
      .select()
      .single()
    if (updErr) {
      alert(updErr.message)
      return
    }
    updateClass(data)
    cancelEdit()
  }

  async function deleteClass(cls) {
    if (
      !confirm(
        `Klasse "${cls.name}" wirklich löschen? Schüler, Stunden und Beobachtungen werden ggf. mit entfernt.`
      )
    ) {
      return
    }
    const { error: delErr } = await supabase
      .from('classes')
      .delete()
      .eq('id', cls.id)
    if (delErr) {
      alert(delErr.message)
      return
    }
    removeClass(cls.id)
    if (activeClassId === cls.id) setActiveClassId(null)
  }

  return (
    <div className="admin-block">
      <section className="card">
        <h2>Neue Klasse</h2>
        <p className="card-subtitle">
          Beim Anlegen wird automatisch ein Lehrplan generiert.
        </p>

        <form className="form" onSubmit={handleCreate}>
          <div className="admin-form-row">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                placeholder="z.B. 8b"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="subject">Fach</label>
              <input
                id="subject"
                type="text"
                placeholder="z.B. Mathematik"
                value={form.subject}
                onChange={(e) => updateField('subject', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="grade">Jahrgang</label>
              <input
                id="grade"
                type="text"
                placeholder="z.B. 8"
                value={form.grade}
                onChange={(e) => updateField('grade', e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="state">Bundesland</label>
              <select
                id="state"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
              >
                {BUNDESLAENDER.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && <div className="alert error">{formError}</div>}
          {formSuccess && <div className="alert success">{formSuccess}</div>}
          {curriculumLoading && (
            <div className="loading-indicator">
              <span className="spinner" />
              <span>Lehrplan wird generiert…</span>
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
        {!loading && classes.length === 0 && (
          <p className="empty-state">Noch keine Klassen.</p>
        )}

        {classes.length > 0 && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Fach</th>
                <th>Jg.</th>
                <th>Bundesland</th>
                <th className="admin-table-actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => {
                const isEditing = editId === cls.id
                return (
                  <tr key={cls.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            value={editValues.name}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                name: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={editValues.subject}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                subject: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={editValues.grade}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                grade: e.target.value,
                              }))
                            }
                          />
                        </td>
                        <td>
                          <select
                            value={editValues.state}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                state: e.target.value,
                              }))
                            }
                          >
                            {BUNDESLAENDER.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="admin-table-actions">
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={saveEdit}
                          >
                            Speichern
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={cancelEdit}
                          >
                            Abbrechen
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{cls.name}</strong>
                          {activeClassId === cls.id && (
                            <span className="badge-active">Aktiv</span>
                          )}
                        </td>
                        <td>{cls.subject}</td>
                        <td>{cls.grade}</td>
                        <td>{cls.state}</td>
                        <td className="admin-table-actions">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setActiveClassId(cls.id)}
                          >
                            Aktiv setzen
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => startEdit(cls)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => deleteClass(cls)}
                          >
                            Löschen
                          </button>
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
