import { useEffect, useState } from 'react';

export default function DragBadge({ isDragging, count, mousePosition }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isDragging && mousePosition) {
      setPosition({
        x: mousePosition.x + 20, // Offset from cursor
        y: mousePosition.y + 10,
      });
    }
  }, [isDragging, mousePosition]);

  if (!isDragging || count <= 0) return null;

  return (
    <div
      className="drag-badge"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div className="drag-badge-stack">
        {/* Create stacked layer effect like Google Sheets */}
        {count >= 3 && <div className="drag-badge-layer drag-badge-layer-3" />}
        {count >= 2 && <div className="drag-badge-layer drag-badge-layer-2" />}
        <div className="drag-badge-layer drag-badge-layer-1">
          <div className="drag-badge-count">{count}</div>
        </div>
      </div>
    </div>
  );
}
