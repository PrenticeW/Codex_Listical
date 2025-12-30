import React from 'react';
import { COLOR_PALETTE } from '../../utils/staging/planTableHelpers';

/**
 * Color swatch grid for selecting project colors
 */
export default function ColorSwatchGrid({
  selectedColor,
  onSelect = () => {},
  buttonSize = 28,
  columns = 4,
}) {
  const normalizedColor = selectedColor || COLOR_PALETTE[0];

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {COLOR_PALETTE.map((color) => {
        const isActive = color === normalizedColor;
        return (
          <button
            key={color}
            type="button"
            className="rounded transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              width: buttonSize,
              height: buttonSize,
              backgroundColor: color,
              border: isActive ? '2px solid #0f172a' : '2px solid rgba(15,23,42,0.35)',
              boxShadow: '0 1px 2px rgba(15,23,42,0.25)',
            }}
            onClick={() => onSelect(color)}
            aria-label={`Select color ${color}`}
          />
        );
      })}
    </div>
  );
}
