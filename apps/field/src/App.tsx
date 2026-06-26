import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTodayRoute, getQueueCount } from './lib/api';
import { syncQueue } from './lib/offline';
import LoginScreen from './screens/LoginScreen';
import TodayScreen from './screens/TodayScreen';
import PickupScreen from './screens/PickupScreen';
import TaggingScreen from './screens/TaggingScreen';
import PackingScreen from './screens/PackingScreen';
import HistoryScreen from './screens/HistoryScreen';
import ProfileScreen from './screens/ProfileScreen';
import { clearToken } from './lib/api';

export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const navigate = useNavigate();

  const token = localStorage.getItem('ff_token');
  const role = localStorage.getItem('ff_role');

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onSynced = () => { refreshQueue(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('ff:synced', onSynced as EventListener);

    const refreshQueue = () => getQueueCount().then(setQueueCount);
    refreshQueue();
    const interval = setInterval(refreshQueue, 5000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('ff:synced', onSynced as EventListener);
      clearInterval(interval);
    };
  }, []);

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  const logout = () => { clearToken(); localStorage.removeItem('ff_role'); navigate('/login'); };

  return (
    <div>
      {!isOnline && <div className="offline-banner">⚠ Offline — pickups will sync when reconnected ({queueCount} queued)</div>}
      {isOnline && queueCount > 0 && (
        <div className="offline-banner" style={{ background: 'var(--success)' }}>
          Online — syncing {queueCount} queued pickups…
        </div>
      )}
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/pickup/:clientId" element={<PickupScreen />} />
        <Route path="/tagging/:lotId" element={<TaggingScreen />} />
        <Route path="/packing/:lotId" element={<PackingScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/profile" element={<ProfileScreen onLogout={logout} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <nav className="bottom-nav">
        <a href="/app/" className={location.pathname === '/app/' || location.pathname === '/app' ? 'active' : ''}>Today</a>
        <a href="/app/history" className={location.pathname.includes('/history') ? 'active' : ''}>History</a>
        <a href="/app/profile" className={location.pathname.includes('/profile') ? 'active' : ''}>Profile</a>
      </nav>
    </div>
  );
}