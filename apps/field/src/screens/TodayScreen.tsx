import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getTodayRoute } from '../lib/api';

export default function TodayScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['route-today'],
    queryFn: getTodayRoute,
  });

  const stops = data?.data ?? [];
  const pickups = stops.filter((s: any) => s.type === 'pickup');
  const returns = stops.filter((s: any) => s.type === 'return');

  return (
    <div>
      <div className="app-header">Today's Route • {stops.length} stops</div>
      <div style={{ padding: 12, paddingBottom: 80 }}>
        {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>Loading…</p>}
        {error && <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{String(error)}</p>}

        {pickups.length > 0 && (
          <>
            <h3 style={{ margin: '12px 0 4px', color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase' }}>Pickups</h3>
            {pickups.map((s: any) => (
              <div key={`p-${s.clientId}`} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong>{s.sortOrder}. {s.clientName}</strong>
                    <br />
                    <span className={`badge badge-${s.businessType}`}>{s.businessType}</span>
                    {' '}
                    <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{s.window}</span>
                  </div>
                  {s.pendingIssues > 0 && <span className="badge badge-warning">⚠ {s.pendingIssues} pending</span>}
                </div>
                {s.lastPickup && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
                    Last: {s.lastPickup.qty} pcs
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {s.mapsUrl && <a href={s.mapsUrl} target="_blank" className="btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>📍 Navigate</a>}
                  <Link to={`/pickup/${s.clientId}`} className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Start Pickup</Link>
                </div>
              </div>
            ))}
          </>
        )}

        {returns.length > 0 && (
          <>
            <h3 style={{ margin: '16px 0 4px', color: 'var(--text-muted)', fontSize: 13, textTransform: 'uppercase' }}>Returns</h3>
            {returns.map((s: any) => (
              <div key={`r-${s.clientId}`} className="card">
                <strong>{s.clientName}</strong>
                <br />
                <span className={`badge badge-${s.businessType}`}>{s.businessType}</span>
                {' '}
                <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{s.window}</span>
                <p style={{ fontSize: 13, marginTop: 8 }}>{s.readyLots?.length ?? 0} lot(s) ready for delivery</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {s.mapsUrl && <a href={s.mapsUrl} target="_blank" className="btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>📍 Navigate</a>}
                </div>
              </div>
            ))}
          </>
        )}

        {!isLoading && stops.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text-muted)' }}>
            <p>No stops scheduled for today 🎉</p>
          </div>
        )}
      </div>
    </div>
  );
}