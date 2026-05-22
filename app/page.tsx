export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: 640, textAlign: 'left' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#7c7065' }}>
          Popcorn Language · backend bootstrap
        </div>
        <h1 style={{ fontSize: 48, lineHeight: 1.05, margin: '12px 0 16px' }}>
          Server is up.
        </h1>
        <p style={{ color: '#5a5247', lineHeight: 1.6 }}>
          The Next.js app and Prisma schema are wired. UI lives in <code>prototypes/web/</code>{' '}
          and will be migrated into <code>app/</code> in later weeks. Health endpoint:{' '}
          <a href="/api/system/health" style={{ color: '#b85b3a' }}>
            /api/system/health
          </a>
          .
        </p>
      </div>
    </main>
  );
}
