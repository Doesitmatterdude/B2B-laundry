interface Props { onLogout: () => void; }

export default function ProfileScreen({ onLogout }: Props) {
  const role = localStorage.getItem('ff_role') ?? 'UNKNOWN';
  const name = localStorage.getItem('ff_name') ?? 'Worker';

  return (
    <div>
      <div className="app-header">Profile</div>
      <div style={{ padding: 16, paddingBottom: 80 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>👤</div>
          <h3>{name}</h3>
          <p style={{ color: 'var(--text-muted)' }}>Role: {role}</p>
        </div>
        <button className="btn-danger" onClick={onLogout} style={{ width: '100%', marginTop: 16, height: 52 }}>
          Sign Out
        </button>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 24 }}>
          FreshFold LMS v1.0 • M2 Field PWA
        </p>
      </div>
    </div>
  );
}