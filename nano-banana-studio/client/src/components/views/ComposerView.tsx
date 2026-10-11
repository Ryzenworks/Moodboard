import { DEFAULT_SETTINGS, SUPPORTED_ASPECT_RATIOS, SUPPORTED_IMAGE_SIZES } from '@shared/types';

export function ComposerView() {
  return (
    <div className="view-container">
      <div className="composer-layout">
        {/* Prompt Editor */}
        <section className="composer-section">
          <div className="composer-section-header">Prompt</div>
          <div className="prompt-editor-placeholder">
            Describe the image you want to create...
          </div>
        </section>

        {/* Reference Images */}
        <section className="composer-section">
          <div className="composer-section-header">Reference Images</div>
          <div className="reference-panel-placeholder">
            <span>📎</span>
            <span>Drop reference images here or click to upload</span>
          </div>
        </section>

        {/* Generation Settings */}
        <section className="composer-section">
          <div className="composer-section-header">Settings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Model */}
            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Model</div>
              <div className="settings-row">
                <div className="setting-chip active">Nano Banana Pro</div>
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Aspect Ratio</div>
              <div className="settings-row">
                {SUPPORTED_ASPECT_RATIOS.map((ratio) => (
                  <div
                    key={ratio}
                    className={`setting-chip ${ratio === DEFAULT_SETTINGS.aspectRatio ? 'active' : ''}`}
                  >
                    {ratio}
                  </div>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginBottom: '6px' }}>Resolution</div>
              <div className="settings-row">
                {SUPPORTED_IMAGE_SIZES.map((size) => (
                  <div
                    key={size}
                    className={`setting-chip ${size === DEFAULT_SETTINGS.imageSize ? 'active' : ''}`}
                  >
                    {size}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Generate Button */}
        <button className="generate-button" disabled>
          Generate
        </button>
      </div>
    </div>
  );
}
