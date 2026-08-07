export default function Loading() {
  return (
    <>
      <style>{`
        @keyframes lg-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes lg-pulse-a {
          0%, 100% { transform: translate(-9px, 0); }
          50% { transform: translate(-88px, 0); }
        }
        @keyframes lg-pulse-b {
          0%, 100% { transform: translate(9px, 0); }
          50% { transform: translate(88px, 0); }
        }
        @keyframes lg-beat {
          0%, 100% { transform: scale(1); }
          30% { transform: scale(1.11); }
          60% { transform: scale(1); }
        }
        @keyframes lg-size-a {
          0%, 100% { transform: scale(0.62); }
          50% { transform: scale(0.82); }
        }
        @keyframes lg-size-b {
          0%, 100% { transform: scale(1.2); }
          50% { transform: scale(1.0); }
        }
        .lg-beat {
          transform-box: view-box;
          transform-origin: 450px 450px;
          animation: lg-beat 2s ease-in-out infinite;
        }
        .lg-orbit {
          transform-box: view-box;
          transform-origin: 450px 450px;
          animation: lg-spin 6s linear infinite;
        }
        .lg-a { animation: lg-pulse-a 3s ease-in-out infinite; }
        .lg-b { animation: lg-pulse-b 3s ease-in-out infinite; }
        .lg-ca, .lg-cb {
          transform-box: view-box;
          transform-origin: 450px 450px;
        }
        .lg-ca { animation: lg-size-a 3s ease-in-out infinite; }
        .lg-cb { animation: lg-size-b 3s ease-in-out infinite; }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#064B3D',
          zIndex: 9999,
        }}
      >
        <svg
          viewBox="0 0 900 900"
          style={{ width: '180px', height: '180px', display: 'block' }}
          aria-label="Cargando"
          role="img"
        >
          <defs>
            <filter id="goo">
              <feGaussianBlur in="SourceGraphic" stdDeviation="13" result="blur" />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
                result="goo"
              />
            </filter>
          </defs>
          <g className="lg-beat" filter="url(#goo)">
            <g className="lg-orbit">
              <g className="lg-a">
                <circle className="lg-ca" cx="450" cy="450" r="68" fill="#4164FE" />
              </g>
              <g className="lg-b">
                <circle className="lg-cb" cx="450" cy="450" r="68" fill="#4164FE" />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </>
  );
}
