import { QRCodeSVG as QRCode } from 'qrcode.react'

const QR_BASE_URL = 'https://prep-less-lyart.vercel.app/stunde'

export default function StartModal({ lessonId, onClose }) {
  const qrUrl = `${QR_BASE_URL}/${lessonId}`

  return (
    <div className="start-modal-overlay" onClick={onClose}>
      <div className="start-modal" onClick={(e) => e.stopPropagation()}>
        <div className="start-modal-header">
          <h2>▶ Stunde starten</h2>
          <button
            className="start-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="start-modal-content">
          <p className="start-modal-text">Scanne den QR-Code mit deinem Smartphone</p>

          <div className="start-modal-qr-container">
            <QRCode
              value={qrUrl}
              size={200}
              level="H"
              includeMargin={true}
            />
          </div>

          <p className="start-modal-url">
            <a href={qrUrl} target="_blank" rel="noopener noreferrer">
              {qrUrl}
            </a>
          </p>

          <p style={{ fontSize: '11px', wordBreak: 'break-all', color: '#999', marginTop: '12px' }}>
            {qrUrl}
          </p>
        </div>
      </div>
    </div>
  )
}
