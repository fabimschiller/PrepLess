export default function MaterialsModal({ materials, onClose }) {
  return (
    <div className="materials-modal-overlay" onClick={onClose}>
      <div className="materials-modal" onClick={(e) => e.stopPropagation()}>
        <div className="materials-modal-header">
          <h2>📚 Ergänzendes Material zur Stunde</h2>
          <button
            className="materials-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="materials-modal-content">
          {!materials ? (
            <div className="materials-error">
              <p>Keine Materialien geladen.</p>
            </div>
          ) : (
            <>
              <h3 className="materials-title">📚 Lernmaterialien zur Stunde</h3>

              {materials.videos && materials.videos.length > 0 && (
                <div className="material-category">
                  <h4 className="material-category-title">🎥 Videos</h4>
                  <div className="material-list">
                    {materials.videos.map((item, idx) => (
                      <div key={`video-${idx}`} className="material-item">
                        <p className="material-description">{item.beschreibung}</p>
                        <div className="material-search-code">{item.suchbegriff}</div>
                        {item.plattform && <p className="material-source">{item.plattform}</p>}
                        <button
                          type="button"
                          className="material-search-btn"
                          onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                        >
                          🔍 Suchen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {materials.artikel && materials.artikel.length > 0 && (
                <div className="material-category">
                  <h4 className="material-category-title">📖 Artikel</h4>
                  <div className="material-list">
                    {materials.artikel.map((item, idx) => (
                      <div key={`artikel-${idx}`} className="material-item">
                        <p className="material-description">{item.beschreibung}</p>
                        <div className="material-search-code">{item.suchbegriff}</div>
                        {item.quelle && <p className="material-source">{item.quelle}</p>}
                        <button
                          type="button"
                          className="material-search-btn"
                          onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                        >
                          🔍 Suchen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {materials.podcasts && materials.podcasts.length > 0 && (
                <div className="material-category">
                  <h4 className="material-category-title">🎧 Podcasts</h4>
                  <div className="material-list">
                    {materials.podcasts.map((item, idx) => (
                      <div key={`podcast-${idx}`} className="material-item">
                        <p className="material-description">{item.beschreibung}</p>
                        <div className="material-search-code">{item.suchbegriff}</div>
                        {item.plattform && <p className="material-source">{item.plattform}</p>}
                        <button
                          type="button"
                          className="material-search-btn"
                          onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                        >
                          🔍 Suchen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {materials.uebungsmaterial && materials.uebungsmaterial.length > 0 && (
                <div className="material-category">
                  <h4 className="material-category-title">📋 Übungsmaterial</h4>
                  <div className="material-list">
                    {materials.uebungsmaterial.map((item, idx) => (
                      <div key={`uebung-${idx}`} className="material-item">
                        <p className="material-description">{item.beschreibung}</p>
                        <div className="material-search-code">{item.suchbegriff}</div>
                        {item.quelle && <p className="material-source">{item.quelle}</p>}
                        <button
                          type="button"
                          className="material-search-btn"
                          onClick={() => window.open(`https://google.com/search?q=${encodeURIComponent(item.suchbegriff)}`, '_blank')}
                        >
                          🔍 Suchen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
