export function HistoryView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">History</h1>
        <p className="view-subtitle">All your previous generations</p>
      </div>
      <div className="empty-state">
        <div className="empty-state-icon">⏱</div>
        <div className="empty-state-title">No generations yet</div>
        <div className="empty-state-subtitle">
          Create your first generation to see it here
        </div>
      </div>
    </div>
  );
}
