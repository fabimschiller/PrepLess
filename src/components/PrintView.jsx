/**
 * PrintView.jsx
 *
 * Rendert Karteikarten im A6-Format, je 4 pro A4-Seite (2×2 Grid).
 * Wird via renderToStaticMarkup() als HTML-String in ein neues Fenster geschrieben.
 *
 * Props:
 *   lessonJson  – { titel, lernziele, phasen, differenzierung }
 *   meta        – { subject, grade, schoolType, className }
 */
export default function PrintView({ lessonJson, meta = {} }) {
  if (!lessonJson) return null

  const { titel, lernziele = [], phasen = [], differenzierung } = lessonJson
  const { subject, grade, schoolType } = meta

  const gesamtdauer = phasen.reduce((sum, p) => sum + (p.dauer_minuten ?? 0), 0)
  const metaLine = [subject, grade ? `Jg. ${grade}` : null, schoolType]
    .filter(Boolean).join(' · ')
  const hasDiff = differenzierung?.foerderung || differenzierung?.erweiterung

  // ── Alle Karten als React-Elemente zusammenstellen ──────────────────────────

  const karten = []

  // Karte 0: Übersicht
  karten.push(
    <div key="overview" className="karte">
      <div className="karte-logo">PrepLess</div>
      <div className="karte-titel">{titel ?? 'Unterrichtsstunde'}</div>
      {metaLine && <div className="karte-meta">{metaLine}</div>}
      {gesamtdauer > 0 && <div className="karte-dauer">{gesamtdauer} Minuten</div>}
      {lernziele.length > 0 && (
        <div className="karte-lernziele">
          <div className="karte-section-label">Lernziele</div>
          <ul>
            {lernziele.map((z, i) => <li key={i}>{z}</li>)}
          </ul>
        </div>
      )}
    </div>
  )

  // Karten 1…N: Phasen
  phasen.forEach((phase, i) => {
    karten.push(
      <div key={`phase-${i}`} className="karte">
        <div className="karte-phase-header">
          <span className="karte-phase-num">{phase.nummer ?? i + 1}</span>
          <span className="karte-phase-titel">{phase.titel}</span>
          {phase.dauer_minuten && (
            <span className="karte-phase-dauer">{phase.dauer_minuten} min</span>
          )}
        </div>
        {phase.kurzfassung && (
          <div className="karte-kurzfassung">{phase.kurzfassung}</div>
        )}
        <div className="karte-aktionen">
          {phase.lehreraktion && (
            <div className="karte-aktion">
              <span className="karte-aktion-icon">👩‍🏫</span>
              <span>{phase.lehreraktion}</span>
            </div>
          )}
          {phase.schueleraktion && (
            <div className="karte-aktion">
              <span className="karte-aktion-icon">👥</span>
              <span>{phase.schueleraktion}</span>
            </div>
          )}
        </div>
        {phase.material?.length > 0 && (
          <ul className="karte-material">
            {phase.material.map((m, j) => <li key={j}>{m}</li>)}
          </ul>
        )}
        {phase.transition && (
          <div className="karte-transition">→ {phase.transition}</div>
        )}
      </div>
    )
  })

  // Letzte Karte: Differenzierung
  if (hasDiff) {
    karten.push(
      <div key="diff" className="karte">
        {differenzierung.foerderung && (
          <div className="karte-diff-block">
            <div className="karte-diff-label">🔽 Förderung</div>
            <p>{differenzierung.foerderung}</p>
          </div>
        )}
        {differenzierung.foerderung && differenzierung.erweiterung && (
          <hr className="karte-diff-hr" />
        )}
        {differenzierung.erweiterung && (
          <div className="karte-diff-block">
            <div className="karte-diff-label">🔼 Erweiterung</div>
            <p>{differenzierung.erweiterung}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Je 4 Karten zu einer .seite gruppieren ──────────────────────────────────

  const seiten = []
  for (let i = 0; i < karten.length; i += 4) {
    const gruppe = karten.slice(i, i + 4)
    // Letzte Seite mit leeren Platzhaltern auffüllen
    while (gruppe.length < 4) {
      gruppe.push(<div key={`empty-${gruppe.length}`} className="karte karte-leer" />)
    }
    seiten.push(
      <div key={`seite-${i}`} className="seite">
        {gruppe}
      </div>
    )
  }

  return <div>{seiten}</div>
}
