export function FavoritesView() {
  return (
    <div className="view-container">
      <div className="view-header">
        <h1 className="view-title">Favorites</h1>
        <p className="view-subtitle">Your starred generations</p>
      </div>
      <div className="empty-state">
        <div className="empty-state-icon">★</div>
        <div className="empty-state-title">No favorites yet</div>
        <div className="empty-state-subtitle">
          Star a generation to save it here
        </div>
      </div>
    </div>
  );
}
