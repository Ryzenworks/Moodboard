import type { SidebarView } from '@shared/types';
import { useEffect, useState } from 'react';

interface SidebarProps {
  activeView: SidebarView;
  onNavigate: (view: SidebarView) => void;
}

const NAV_ITEMS: { view: SidebarView; label: string; icon: string }[] = [
  { view: 'composer', label: 'New Generation', icon: '✦' },
  { view: 'history', label: 'History', icon: '⏱' },
  { view: 'favorites', label: 'Favorites', icon: '★' },
  { view: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        setApiStatus(data.apiKeyConfigured ? 'connected' : 'disconnected');
      })
      .catch(() => setApiStatus('disconnected'));
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">N</div>
          <span className="sidebar-logo-text">Nano Banana</span>
          <span className="sidebar-logo-badge">Studio</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.view}
            className={`sidebar-nav-item ${activeView === item.view ? 'active' : ''}`}
            onClick={() => onNavigate(item.view)}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <span
            className={`sidebar-status-dot ${
              apiStatus === 'connected' ? 'connected' : 'disconnected'
            }`}
          />
          <span>
            {apiStatus === 'checking'
              ? 'Checking...'
              : apiStatus === 'connected'
              ? 'API Connected'
              : 'API Not Configured'}
          </span>
        </div>
      </div>
    </aside>
  );
}
