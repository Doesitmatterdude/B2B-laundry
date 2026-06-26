import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setToken } from '../lib/api';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await login(identifier, password);
      setToken(res.access_token);
      localStorage.setItem('ff_role', res.user.role);
      navigate('/');
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ color: 'var(--primary)', fontSize: 28 }}>FreshFold</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Field Worker App</p>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="text" placeholder="Email or Phone"
          value={identifier} onChange={(e) => setIdentifier(e.target.value)}
          style={{ height: 48, padding: '0 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 16 }}
          required
        />
        <input
          type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ height: 48, padding: '0 12px', borderRadius: 8, border: '2px solid var(--border)', fontSize: 16 }}
          required
        />
        {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={loading} style={{ height: 52, fontSize: 18 }}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}