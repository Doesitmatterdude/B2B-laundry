import { useQuery } from '@tanstack/react-query';
import { listLots } from '../lib/api';

export default function HistoryScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['lots-history'],
    queryFn: () => listLots('limit=50'),
  });

  const lots = (data as any)?.data ?? [];

  const statusColors: Record<string, string> = {
    collected: 'badge-warning', tagged: 'badge-warning',
    washed: 'badge-hotel', drying: 'badge-hotel', ironed: 'badge-hotel',
    packed: 'badge-success', ready: 'badge-success',
    delivered: 'badge-success', completed: 'badge-success',
  };

  return (
    <div>
      <div className="app-header">History</div>
      <div style={{ padding: 12, paddingBottom: 80 }}>
        {isLoading && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</p>}
        {lots.map((lot: any) => (
          <div key={lot.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{lot.lotNumber}</strong>
              <span className={`badge ${statusColors[lot.status] ?? 'badge-hotel'}`}>{lot.status}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {lot.client?.name} • {lot.totalPickupQty} pcs
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {lot.pickupAt ? new Date(lot.pickupAt).toLocaleString('en-IN') : ''}
            </p>
          </div>
        ))}
        {!isLoading && lots.length === 0 && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>No lots yet</p>
        )}
      </div>
    </div>
  );
}