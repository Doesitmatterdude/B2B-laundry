import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getLot, api } from '../lib/api';

// Tagging screen — tagger recounts, classifies mismatches, flags defects.
// SRS 10.2. Shows expected (pickup) vs actual (recount) per category.

export default function TaggingScreen() {
  const { lotId } = useParams<{ lotId: string }>();
  const navigate = useNavigate();
  const { data: lotData, isLoading } = useQuery({
    queryKey: ['lot', lotId],
    queryFn: () => getLot(lotId!),
    enabled: !!lotId,
  });

  const lot = (lotData as any)?.data ?? lotData;
  const items = lot?.items ?? [];

  const [taggingQty, setTaggingQty] = useState<Record<string, number>>({});
  const [discrepancies, setDiscrepancies] = useState<Record<string, { type: string; qty: number } | null>>({});
  const [defects, setDefects] = useState<{ categoryId: string; type: string; qty: number; note: string }[]>([]);
  const [showDefectForm, setShowDefectForm] = useState(false);
  const [defectCat, setDefectCat] = useState('');
  const [defectType, setDefectType] = useState('torn');
  const [defectNote, setDefectNote] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: any) => api(`/lots/${lotId}/tagging`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { alert('Tagging confirmed!'); navigate('/'); },
    onError: (err: any) => alert(err.message),
  });

  const handleSubmit = () => {
    const itemsPayload = items.map((i: any) => ({
      categoryId: i.categoryId,
      taggingQty: taggingQty[i.categoryId] ?? i.pickupQty,
    }));
    const discPayload = Object.entries(discrepancies)
      .filter(([, v]) => v !== null)
      .map(([catId, v]) => ({ categoryId: catId, type: v!.type, qty: v!.qty }));
    const defectPayload = defects.map((d) => ({ ...d, qty: d.qty || 1 }));

    mutation.mutate({ items: itemsPayload, discrepancies: discPayload, defects: defectPayload });
  };

  const setQty = (catId: string, delta: number) => {
    setTaggingQty((prev) => {
      const item = items.find((i: any) => i.categoryId === catId);
      const current = prev[catId] ?? item?.pickupQty ?? 0;
      return { ...prev, [catId]: Math.max(0, current + delta) };
    });
  };

  const getDelta = (catId: string) => {
    const item = items.find((i: any) => i.categoryId === catId);
    const actual = taggingQty[catId] ?? item?.pickupQty ?? 0;
    const expected = item?.pickupQty ?? 0;
    return actual - expected;
  };

  const addDefect = () => {
    if (!defectCat) return;
    setDefects((prev) => [...prev, { categoryId: defectCat, type: defectType, qty: 1, note: defectNote }]);
    setDefectCat(''); setDefectType('torn'); setDefectNote(''); setShowDefectForm(false);
  };

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading lot…</div>;

  return (
    <div>
      <div className="app-header">
        ← <span onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Back</span>
        {' • '}Tagging • {lot?.lotNumber}
      </div>

      <div style={{ padding: 12, paddingBottom: 120 }}>
        <div className="card" style={{ background: '#e8f0fe' }}>
          <strong>{lot?.client?.name}</strong>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Recount each category. Mismatches will be highlighted.</p>
        </div>

        {items.map((item: any) => {
          const delta = getDelta(item.categoryId);
          const actual = taggingQty[item.categoryId] ?? item.pickupQty;
          return (
            <div key={item.categoryId} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 24 }}>{item.category?.icon ?? '👕'}</span>{' '}
                  <strong>{item.category?.name}</strong>
                  <br />
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Expected: {item.pickupQty}</span>
                </div>
                <div className="stepper">
                  <button onClick={() => setQty(item.categoryId, -1)}>−</button>
                  <input type="number" value={actual} onChange={(e) => setTaggingQty((p) => ({ ...p, [item.categoryId]: Math.max(0, +e.target.value) }))} />
                  <button onClick={() => setQty(item.categoryId, 1)}>+</button>
                </div>
              </div>
              {delta !== 0 && (
                <div style={{ marginTop: 8, padding: 8, background: delta < 0 ? '#fee2e2' : '#d1fae5', borderRadius: 8 }}>
                  <span style={{ fontWeight: 600, color: delta < 0 ? '#991b1b' : '#065f46' }}>
                    {delta < 0 ? `⚠ ${Math.abs(delta)} missing` : `+${delta} extra`}
                  </span>
                  {delta < 0 && (
                    <select
                      style={{ marginLeft: 8, height: 32, borderRadius: 4, border: '1px solid #ccc' }}
                      onChange={(e) => setDiscrepancies((p) => ({ ...p, [item.categoryId]: { type: e.target.value, qty: Math.abs(delta) } }))}
                      defaultValue=""
                    >
                      <option value="">Classify…</option>
                      <option value="missing">Missing</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  )}
                  {delta > 0 && (
                    <select
                      style={{ marginLeft: 8, height: 32, borderRadius: 4, border: '1px solid #ccc' }}
                      onChange={(e) => setDiscrepancies((p) => ({ ...p, [item.categoryId]: { type: e.target.value, qty: delta } }))}
                      defaultValue=""
                    >
                      <option value="">Classify…</option>
                      <option value="extra">Extra</option>
                      <option value="found">Found</option>
                    </select>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Defects section */}
        <div className="card">
          <h4 style={{ marginBottom: 8 }}>Defects ({defects.length})</h4>
          {defects.map((d, i) => (
            <div key={i} style={{ fontSize: 14, padding: 4, color: '#991b1b' }}>
              {d.type} — {items.find((i: any) => i.categoryId === d.categoryId)?.category?.name} {d.note && `(${d.note})`}
            </div>
          ))}
          {!showDefectForm ? (
            <button className="btn-outline" style={{ marginTop: 8 }} onClick={() => setShowDefectForm(true)}>+ Flag Defect</button>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={defectCat} onChange={(e) => setDefectCat(e.target.value)} style={{ height: 40, borderRadius: 4 }}>
                <option value="">Select category…</option>
                {items.map((i: any) => <option key={i.categoryId} value={i.categoryId}>{i.category?.name}</option>)}
              </select>
              <select value={defectType} onChange={(e) => setDefectType(e.target.value)} style={{ height: 40, borderRadius: 4 }}>
                <option value="already_damaged">Already Damaged</option>
                <option value="stained">Stained</option>
                <option value="burn">Burn Marks</option>
                <option value="torn">Torn</option>
                <option value="color_fade">Color Fade</option>
                <option value="button_missing">Buttons Missing</option>
                <option value="zipper_broken">Zipper Broken</option>
                <option value="other">Other</option>
              </select>
              <input placeholder="Note (optional)" value={defectNote} onChange={(e) => setDefectNote(e.target.value)} style={{ height: 40, borderRadius: 4, border: '1px solid #ccc', padding: '0 8px' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={addDefect}>Add</button>
                <button className="btn-outline" onClick={() => setShowDefectForm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="total-bar">
        <span>{items.length} categories</span>
        <button className="btn-primary" onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Confirming…' : 'Confirm Tagging'}
        </button>
      </div>
    </div>
  );
}