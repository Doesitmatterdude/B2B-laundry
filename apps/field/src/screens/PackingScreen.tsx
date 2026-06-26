import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getLot, api } from '../lib/api';

// Packing screen — three-way reconciliation: Pickup | Tagging | Packing.
// SRS 10.4. Highlights differences across all three stages.

export default function PackingScreen() {
  const { lotId } = useParams<{ lotId: string }>();
  const navigate = useNavigate();
  const { data: lotData, isLoading } = useQuery({
    queryKey: ['lot', lotId],
    queryFn: () => getLot(lotId!),
    enabled: !!lotId,
  });

  const lot = (lotData as any)?.data ?? lotData;
  const items = lot?.items ?? [];

  const [packingQty, setPackingQty] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState<{ categoryId: string; qty: number }[]>([]);
  const [damaged, setDamaged] = useState<{ categoryId: string; type: string; note: string }[]>([]);

  const mutation = useMutation({
    mutationFn: (payload: any) => api(`/lots/${lotId}/packing`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { alert('Packing confirmed!'); navigate('/'); },
    onError: (err: any) => alert(err.message),
  });

  const handleSubmit = () => {
    const itemsPayload = items.map((i: any) => ({
      categoryId: i.categoryId,
      packingQty: packingQty[i.categoryId] ?? i.taggingQty ?? i.pickupQty,
    }));
    mutation.mutate({ items: itemsPayload, missing, damaged: damaged.map((d) => ({ ...d, qty: 1 })) });
  };

  const setQty = (catId: string, delta: number) => {
    setPackingQty((prev) => {
      const item = items.find((i: any) => i.categoryId === catId);
      const current = prev[catId] ?? item?.taggingQty ?? item?.pickupQty ?? 0;
      return { ...prev, [catId]: Math.max(0, current + delta) };
    });
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading lot…</div>;

  return (
    <div>
      <div className="app-header">
        ← <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Back</span>
        {' • '}Packing • {lot?.lotNumber}
      </div>

      <div style={{ padding: 12, paddingBottom: 120 }}>
        <div className="card" style={{ background: '#e8f0fe' }}>
          <strong>{lot?.client?.name}</strong>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Three-way: Pickup → Tagging → Packing. Differences highlighted.</p>
        </div>

        {/* Header row */}
        <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 1fr', gap: 4, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
          <span>Category</span>
          <span style={{ textAlign: 'center' }}>Pick</span>
          <span style={{ textAlign: 'center' }}>Tag</span>
          <span style={{ textAlign: 'center' }}>Pack Count</span>
        </div>

        {items.map((item: any) => {
          const pickup = item.pickupQty;
          const tagging = item.taggingQty ?? pickup;
          const packing = packingQty[item.categoryId] ?? tagging;
          const lostBetween = packing < tagging;
          const lostFromPickup = packing < pickup;

          return (
            <div key={item.categoryId} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 50px 50px 1fr', gap: 4, alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 20 }}>{item.category?.icon ?? '👕'}</span>{' '}
                <span style={{ fontSize: 14 }}>{item.category?.name}</span>
              </div>
              <span style={{ textAlign: 'center', fontSize: 14 }}>{pickup}</span>
              <span style={{ textAlign: 'center', fontSize: 14 }}>{tagging}</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <button onClick={() => setQty(item.categoryId, -1)} style={{ width: 32, height: 32, fontSize: 16, background: '#e8f0fe', color: '#0b5394' }}>−</button>
                <input type="number" value={packing} onChange={(e) => setPackingQty((p) => ({ ...p, [item.categoryId]: Math.max(0, +e.target.value) }))} style={{ width: 50, textAlign: 'center', height: 32, fontSize: 14, border: '2px solid #e5e7eb', borderRadius: 4 }} />
                <button onClick={() => setQty(item.categoryId, 1)} style={{ width: 32, height: 32, fontSize: 16, background: '#e8f0fe', color: '#0b5394' }}>+</button>
              </div>
              {lostBetween && (
                <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 6, background: '#fee2e2', borderRadius: 6, fontSize: 13, color: '#991b1b' }}>
                  ⚠ {tagging - packing} lost between Tagging → Packing
                  <button className="btn-danger" style={{ marginLeft: 8, height: 28, fontSize: 12, padding: '0 8px' }}
                    onClick={() => setMissing((prev) => [...prev.filter((m) => m.categoryId !== item.categoryId), { categoryId: item.categoryId, qty: tagging - packing }])}>
                    Mark Missing
                  </button>
                </div>
              )}
              {!lostBetween && lostFromPickup && (
                <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 6, background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  ⚠ {pickup - packing} lost before tagging (pickup vs tag)
                </div>
              )}
            </div>
          );
        })}

        {/* Missing summary */}
        {missing.length > 0 && (
          <div className="card" style={{ background: '#fee2e2' }}>
            <h4 style={{ color: '#991b1b' }}>Missing Items ({missing.length})</h4>
            {missing.map((m, i) => (
              <div key={i} style={{ fontSize: 14 }}>
                {items.find((i: any) => i.categoryId === m.categoryId)?.category?.name}: {m.qty} pcs
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="total-bar">
        <span>{items.length} categories</span>
        <button className="btn-primary" onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Confirming…' : 'Confirm Packing'}
        </button>
      </div>
    </div>
  );
}