import { useEffect, useState } from 'react';
import type { ApiHealthResponse } from '@shared/types';

export function SettingsView() {
  const [health, setHealth] = useState<ApiHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError('Could not reach backend'));
  }, []);

  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <p className="view-subtitle">Application configuration</p>
      </div>

      <section className="composer-section">
        <div className="composer-section-header">Gemini API Status</div>
        {error ? (
          <div style={{ color: 'var(--error)', fontSize: 'var(--text-base)' }}>
            ✗ {error}
          </div>
        ) : health ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                className={`sidebar-status-dot ${health.apiKeyConfigured ? 'connected' : 'disconnected'}`}
              />
              <span style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}>
                {health.apiKeyConfigured ? 'API Key Configured' : 'API Key Not Configured'}
              </span>
            </div>
            {!health.apiKeyConfigured && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                <p>To get started:</p>
                <ol style={{ paddingLeft: '20px', marginTop: '4px' }}>
                  <li>Go to <strong>aistudio.google.com/apikey</strong></li>
                  <li>Create an API key</li>
                  <li>Copy <code className="kbd">server/.env.example</code> to <code className="kbd">server/.env</code></li>
                  <li>Paste your key into <code className="kbd">GEMINI_API_KEY=</code></li>
                  <li>Restart the server</li>
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-tertiary)' }}>Checking...</div>
        )}
      </section>

      <section className="composer-section" style={{ marginTop: '20px' }}>
        <div className="composer-section-header">About</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
          <p><strong>Nano Banana Studio</strong> v1.0.0</p>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>Local image generation workstation powered by Nano Banana Pro</p>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '2px' }}>Model: gemini-3-pro-image</p>
        </div>
      </section>
    </div>
  );
}
