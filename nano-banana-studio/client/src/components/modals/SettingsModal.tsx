import { useEffect, useState, useCallback } from 'react';

interface ModelStatusResponse {
  apiKeyConfigured: boolean;
  model: string;
  modelDisplayName: string;
  quota: {
    model: string;
    hasQuota: boolean | null;
    tier: 'free' | 'paid' | 'unknown';
    message: string;
    lastChecked: string | null;
  };
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [status, setStatus] = useState<ModelStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/model-status')
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Could not reach server');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-row">
            <span className="modal-icon">⚙</span>
            <h2 className="modal-title">API & Model Status</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1: API Connection & Key */}
          <div className="status-card">
            <div className="status-card-header">
              <span className="status-label">Gemini API Key</span>
              <span
                className={`status-pill ${
                  status?.apiKeyConfigured ? 'status-ok' : 'status-danger'
                }`}
              >
                {status?.apiKeyConfigured ? '✓ Configured' : '✗ Missing'}
              </span>
            </div>
            <p className="status-card-desc">
              {status?.apiKeyConfigured
                ? 'Your API key is securely loaded on the local server from server/.env.'
                : 'No API key found in server/.env. Add GEMINI_API_KEY=your_key to enable generation.'}
            </p>
          </div>

          {/* Section 2: Model Availability & Tier */}
          <div className="status-card">
            <div className="status-card-header">
              <span className="status-label">
                Model: Google Nano Banana Pro ({status?.model || 'gemini-3-pro-image'})
              </span>
              <span
                className={`status-pill ${
                  status?.quota.hasQuota === true
                    ? 'status-ok'
                    : status?.quota.hasQuota === false
                    ? 'status-warning'
                    : 'status-neutral'
                }`}
              >
                {status?.quota.hasQuota === true
                  ? '✓ Available (Paid Tier)'
                  : status?.quota.hasQuota === false
                  ? '✗ Quota Limit: 0 (Free Tier)'
                  : 'Pending Verification'}
              </span>
            </div>

            <div className="status-explanation">
              <div className="status-note-title">Important: Project Tier Distinction</div>
              <p>
                An API key being <strong>Configured</strong> only means the key exists. It does{' '}
                <strong>NOT</strong> mean your project has usable quota for Nano Banana Pro.
              </p>
              <p style={{ marginTop: '6px' }}>
                Google's image generation models (including <code>gemini-3-pro-image</code>) have a{' '}
                <strong>quota limit of 0 on the Free Tier</strong>. They require a Google Cloud billing
                account linked to your project in Google AI Studio.
              </p>
            </div>

            {/* How to enable billing */}
            <div className="billing-steps-box">
              <div className="billing-steps-title">
                📋 How to Enable Billing in Google AI Studio:
              </div>
              <ol className="billing-steps-list">
                <li>
                  Open{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="billing-link"
                  >
                    Google AI Studio (aistudio.google.com)
                  </a>
                </li>
                <li>
                  Click on <strong>Settings</strong> (or <strong>Plan & Billing</strong> /{' '}
                  <strong>Get API Key</strong>).
                </li>
                <li>
                  Look for your attached project and click <strong>"Set up billing"</strong> or{' '}
                  <strong>"Link Google Cloud billing account"</strong>.
                </li>
                <li>
                  Attach a payment method (pay-as-you-go). You only pay for what you generate.
                </li>
                <li>
                  Return here and click <strong>"Refresh Status"</strong> below, then click{' '}
                  <strong>Generate</strong> again.
                </li>
              </ol>
            </div>
          </div>

          {error && <div className="modal-error-banner">✗ {error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={fetchStatus} disabled={loading}>
            {loading ? 'Checking...' : 'Refresh Status'}
          </button>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
