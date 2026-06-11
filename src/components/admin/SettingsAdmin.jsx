import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { SCHOOL_TYPES } from '../../lib/schoolTypes'
import './AdminTables.css'

export default function SettingsAdmin() {
  const [userId, setUserId] = useState(null)
  const [defaultSchoolType, setDefaultSchoolType] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return }
      setUserId(data.user.id)
      const { data: profile } = await supabase
        .from('profiles')
        .select('default_school_type')
        .eq('id', data.user.id)
        .single()
      setDefaultSchoolType(profile?.default_school_type ?? '')
      setLoading(false)
    })
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    if (!userId) return
    setSaving(true); setError(null); setSuccess(null)

    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert({ id: userId, default_school_type: defaultSchoolType }, { onConflict: 'id' })

    setSaving(false)
    if (upsertErr) { setError(upsertErr.message); return }
    setSuccess('Einstellungen gespeichert.')
  }

  return (
    <div className="admin-block">
      <section className="card">
        <h2>Einstellungen</h2>
        <p className="card-subtitle">
          Diese Einstellungen gelten als Standard beim Anlegen neuer Klassen.
        </p>

        {loading ? (
          <p className="empty-state">Lädt…</p>
        ) : (
          <form className="form" onSubmit={handleSave} style={{ maxWidth: 400 }}>
            <div className="field">
              <label htmlFor="default_school_type">Standard-Schultyp</label>
              <select
                id="default_school_type"
                value={defaultSchoolType}
                onChange={(e) => setDefaultSchoolType(e.target.value)}
              >
                <option value="">Kein Standard</option>
                {SCHOOL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {error && <div className="alert error">{error}</div>}
            {success && <div className="alert success">{success}</div>}

            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Speichert…' : 'Einstellungen speichern'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
