import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getClient, createPickup } from '../lib/api';
import { queuePickup } from '../lib/offline';

export default function PickupScreen() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClient(clientId!),
    enabled: !!clientId,
  });

  const categories = (client as any)?.categories ?? [];
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const total = Object.values(counts).reduce((sum, q) => sum + q, 0);

  const setQty = (catId: string, delta: number) => {
    setCounts((prev) => {
      const current = prev[catId] ?? 0;
      return { ...prev, [catId]: Math.max(0, current + delta) };
    });
  };

  const setQtyDirect = (catId: string, val: string) => {
    const n = parseInt(val, 10);
    setCounts((prev) => ({ ...prev, [catId]: isNaN(n) ? 0 : Math.max(0, n) }));
  };

  const handleSubmit = async () => {
    if (total === 0) { setError('Enter at least one item, or use "Empty Pickup"'); return; }
    setSubmitting(true); setError('');

    // Client-generated UUID for idempotency
    const lotUuid = `LOT-${crypto.randomUUID()}`;
    const payload = {
      lotUuid,
      clientId,
      items: categories
        .filter((c: any) => (counts[c.id] ?? 0) > 0)
        .map((c: any) => ({ categoryId: c.id, pickupQty: counts[c.id], unit: c.unit })),
      gps: navigator.geolocation
        ? await new Promise((res) => navigator.geolocation.getCurrentPosition(
            (pos) => res({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => res(null),
            { timeout: 5000 },
          ))
        : null,
      notes,
      capturedAt: new Date().toISOString(),
      // TODO: signatures + photos (M2 enhancement — SignaturePad + PhotoUploader components)
    };

    try {
      if (isOnline) {
        await createPickup(payload);
      } else {
        await queuePickup(payload);
      }
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err: any) {
      // If offline, queue it
      if (!isOnline || String(err).includes('Failed to fetch')) {
        await queuePickup(payload);
        setSuccess(true);
        setTimeout(() => navigate('/'), 1500);
      } else {
        setError(err.message ?? 'Submission failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <h2 style={{ color: 'var(--success)' }}>Pickup Confirmed!</h2>
        <p style={{ color: 'var(--text-muted)' }}>{total} items recorded</p>
        {!isOnline && <p style={{ color: 'var(--warning)', fontSize: 14 }}>Will sync when online</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="app-header">
        ← <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Back</span>
        {' • '}{(client as any)?.name ?? 'Pickup'}
      </div>

      <div style={{ padding: 12, paddingBottom: 120 }}>
        {(client as any) && (
          <div className="card" style={{ background: 'var(--primary-light)' }}>
            <span className={`badge badge-${(client as any).businessType}`}>{(client as any).businessType}</span>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              Enter quantity for each category
            </p>
          </div>
        )}

        {categories.map((cat: any) => (
          <div key={cat.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 24 }}>{cat.icon ?? '👕'}</span>
              {' '}
              <strong>{cat.name}</strong>
            </div>
            <div className="stepper">
              <button onClick={() => setQty(cat.id, -1)}>−</button>
              <input
                type="number"
                value={counts[cat.id] ?? 0}
                onChange={(e) => setQtyDirect(cat.id, e.target.value)}
                min={0}
              />
              <button onClick={() => setQty(cat.id, 1)}>+</button>
            </div>
          </div>
        ))}

        <div className="card">
          <textarea
            placeholder="Notes (optional)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', minHeight: 60, border: '2px solid var(--border)', borderRadius: 8, padding: 8, fontSize: 16 }}
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', textAlign: 'center', padding: 8 }}>{error}</p>}
      </div>

      <div className="total-bar">
        <span>Total: {total} pcs</span>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting} style={{ height: 44 }}>
          {submitting ? 'Confirming…' : 'Confirm Pickup'}
        </button>
      </div>
    </div>
  );
}