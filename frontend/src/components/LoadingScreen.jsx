import { useState, useEffect, useRef } from 'react'

/* ── One-time style injection ───────────────────────────────── */
const LS_STYLE_ID = 'hs-loading-screen-styles'
if (!document.getElementById(LS_STYLE_ID)) {
  const s = document.createElement('style')
  s.id = LS_STYLE_ID
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=JetBrains+Mono:wght@400;600&display=swap');

    @keyframes ls-scanline {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes ls-grid-pulse {
      0%   { opacity: 0.25; }
      100% { opacity: 0.45; }
    }
    @keyframes ls-progress {
      0%   { width: 0%; }
      100% { width: 100%; }
    }
    @keyframes ls-shield-pulse {
      0%, 100% { filter: drop-shadow(0 0 8px #39ff14) drop-shadow(0 0 18px #39ff1455); }
      50%       { filter: drop-shadow(0 0 22px #39ff14) drop-shadow(0 0 40px #39ff1488); }
    }
    @keyframes ls-msg-fade {
      0%   { opacity: 0; transform: translateY(4px); }
      20%  { opacity: 1; transform: translateY(0); }
      80%  { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes ls-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ls-corner-blink {
      0%,100% { opacity: 1; }
      50%      { opacity: 0.4; }
    }
    .ls-grid {
      animation: ls-grid-pulse 2s ease-in-out infinite alternate;
    }
    .ls-shield {
      animation: ls-shield-pulse 2s ease-in-out infinite;
    }
    .ls-progress-fill {
      animation: ls-progress 2s ease-in-out infinite;
    }
    .ls-msg {
      animation: ls-msg-fade 1.5s ease-in-out forwards;
    }
    .ls-corner {
      animation: ls-corner-blink 2s ease infinite;
    }
  `
  document.head.appendChild(s)
}

const MESSAGES = [
  'INITIALIZING SYSTEMS...',
  'LOADING AI MODEL...',
  'CONNECTING TO CAMERAS...',
  'ESTABLISHING SECURE LINK...',
  'VERIFYING CREDENTIALS...',
  'SYNCING SURVEILLANCE NODES...',
]

/* ── Animated shield SVG ────────────────────────────────────── */
function ShieldSVG() {
  return (
    <svg
      className="ls-shield"
      width="72" height="72" viewBox="0 0 72 72" fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M36 4L8 16V36C8 51.4 20.2 65.5 36 68C51.8 65.5 64 51.4 64 36V16L36 4Z"
        fill="#39ff1410"
        stroke="#39ff14"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Inner hexagon */}
      <path
        d="M36 16L22 22V36C22 43.7 28.1 50.8 36 52.5C43.9 50.8 50 43.7 50 36V22L36 16Z"
        fill="#39ff1408"
        stroke="#39ff14"
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      {/* Checkmark */}
      <path
        d="M27 36.5L33 42.5L45 30.5"
        stroke="#39ff14"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.9"
      />
    </svg>
  )
}

/* ── Corner bracket ─────────────────────────────────────────── */
function Corner({ pos }) {
  const style = {
    position: 'absolute', width: 24, height: 24,
    ...(pos === 'tl' ? { top: 16, left: 16, borderTop: '1px solid #2a4a2a', borderLeft: '1px solid #2a4a2a' } : {}),
    ...(pos === 'tr' ? { top: 16, right: 16, borderTop: '1px solid #2a4a2a', borderRight: '1px solid #2a4a2a' } : {}),
    ...(pos === 'bl' ? { bottom: 16, left: 16, borderBottom: '1px solid #2a4a2a', borderLeft: '1px solid #2a4a2a' } : {}),
    ...(pos === 'br' ? { bottom: 16, right: 16, borderBottom: '1px solid #2a4a2a', borderRight: '1px solid #2a4a2a' } : {}),
  }
  return <div className="ls-corner" style={style} />
}

/* ─────────────────────────────────────────────────────────────── */
export default function LoadingScreen({
  message: externalMsg = null,  // override rotating messages if needed
  error = null,                  // { title, detail } object
  onRetry = null,               // function — show retry button if provided
  showSpinner = true,
}) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [msgKey, setMsgKey]     = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (externalMsg || error) return  // don't rotate when forced message or error
    intervalRef.current = setInterval(() => {
      setMsgIndex(i => (i + 1) % MESSAGES.length)
      setMsgKey(k => k + 1)
    }, 1500)
    return () => clearInterval(intervalRef.current)
  }, [externalMsg, error])

  const displayMsg = externalMsg || MESSAGES[msgIndex]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#0a0f0a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
      overflow: 'hidden',
    }}>

      {/* Grid background */}
      <div className="ls-grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(#39ff1412 1px, transparent 1px),
          linear-gradient(90deg, #39ff1412 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
      }} />

      {/* Scanline */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '2px',
        background: 'linear-gradient(transparent, #39ff1420, transparent)',
        animation: 'ls-scanline 3s linear infinite',
        pointerEvents: 'none',
      }} />

      {/* Corner brackets */}
      <Corner pos="tl" /><Corner pos="tr" />
      <Corner pos="bl" /><Corner pos="br" />

      {/* ── Main content ── */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* Shield */}
        <ShieldSVG />

        {/* Title */}
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 26, fontWeight: 700,
          color: '#39ff14',
          letterSpacing: '0.3em',
          marginTop: 20, marginBottom: 4,
          textShadow: '0 0 16px #39ff1488',
        }}>
          HYBRID SENTRY
        </div>

        {/* Subtitle */}
        <div style={{ fontSize: 10, color: '#3a5a3a', letterSpacing: '0.18em', marginBottom: 28 }}>
          SURVEILLANCE · DETECTION · INTELLIGENCE
        </div>

        {/* Error state */}
        {error ? (
          <div style={{
            background: '#1a0505', border: '1px solid #f8514955',
            borderRadius: 6, padding: '16px 20px', maxWidth: 340, textAlign: 'center',
          }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>⚠</div>
            <div style={{ color: '#f85149', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              {error.title || 'Cannot reach server'}
            </div>
            <div style={{ color: '#7a4a4a', fontSize: 10, marginBottom: 10, lineHeight: 1.6 }}>
              {error.detail || 'Make sure backend is running:'}
            </div>
            <div style={{
              background: '#0a0505', border: '1px solid #3a1a1a', borderRadius: 4,
              padding: '6px 10px', fontSize: 9, color: '#f0a070',
              fontFamily: "'JetBrains Mono', monospace", marginBottom: 14,
            }}>
              cd backend && python main.py
            </div>
            {onRetry && (
              <button onClick={onRetry} style={{
                background: '#1a0e0e', border: '1px solid #f85149', color: '#f85149',
                borderRadius: 4, padding: '6px 18px', fontSize: 10, cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
              }}>
                ↺ RETRY
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Spinner ring (optional) */}
            {showSpinner && (
              <div style={{
                width: 32, height: 32,
                border: '2px solid #1a3a1a',
                borderTopColor: '#39ff14',
                borderRadius: '50%',
                animation: 'ls-spin 0.9s linear infinite',
                marginBottom: 20,
              }} />
            )}

            {/* Rotating status message */}
            <div key={msgKey} className="ls-msg" style={{
              fontSize: 11, color: '#7aaa7a',
              letterSpacing: '0.1em', height: 18, textAlign: 'center', marginBottom: 18,
            }}>
              {displayMsg}
            </div>

            {/* Progress bar */}
            <div style={{
              width: 280, height: 2,
              background: '#1a2e1a', borderRadius: 1, overflow: 'hidden',
            }}>
              <div className="ls-progress-fill" style={{
                height: '100%', background: '#39ff14',
                borderRadius: 1,
                boxShadow: '0 0 8px #39ff14, 0 0 16px #39ff1444',
              }} />
            </div>
          </>
        )}

        {/* Classified footer */}
        <div style={{
          marginTop: error ? 24 : 28, fontSize: 9,
          color: '#2a4a2a', letterSpacing: '0.2em',
        }}>
          CLASSIFIED — AUTHORIZED ACCESS ONLY
        </div>
      </div>
    </div>
  )
}
