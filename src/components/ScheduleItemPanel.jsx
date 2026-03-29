import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { parseEstimateLabelToMinutes } from '../utils/staging/planTableHelpers';

const DEFAULT_ROW_HEIGHT_PX = 16;

/**
 * Slide-in panel showing schedule items for all highlighted projects, grouped by project.
 *
 * Props:
 *   projects         – array of { id, label, color, textColor }
 *   scheduleLayout   – { scheduleItemsByProject: Map<projectId, item[]> }
 *   projectChips     – full projectChips array (to count existing placements)
 *   incrementMinutes – current grid increment
 *   rowMetrics       – { [rowId]: { height } }
 *   onAddChip        – (projectId, itemIdx) => void
 *   onClose          – () => void
 */
export default function ScheduleItemPanel({
  projects,
  scheduleLayout,
  projectChips,
  chipTimeOverrides,
  incrementMinutes,
  rowMetrics,
  onAddChip,
  onDragStart,
  onClose,
}) {
  const incrementRowHeightPx = useMemo(() => {
    if (!rowMetrics) return DEFAULT_ROW_HEIGHT_PX;
    for (let h = 0; h < 24; h++) {
      const m = rowMetrics[`hour-${h}`];
      if (m?.height) return m.height;
    }
    const first = Object.values(rowMetrics).find((m) => m?.height);
    return first?.height ?? DEFAULT_ROW_HEIGHT_PX;
  }, [rowMetrics]);

  const durationToPx = (minutes) => {
    if (!incrementMinutes || incrementMinutes <= 0) return DEFAULT_ROW_HEIGHT_PX;
    return Math.max(24, (minutes / incrementMinutes) * incrementRowHeightPx);
  };

  // Sum durationMinutes per project+itemIdx for chips placed in day columns (columnIndex < 8).
  // Keyed by chip ID using the encoded itemIdx so renames to displayLabel never break the link.
  // placedMinutes[projectId][itemIdx] = total minutes placed in day columns
  const placedMinutes = useMemo(() => {
    const result = {};
    if (!projectChips) return result;
    // Extra-copy chips: schedule-chip-{projectId}-{itemIdx}-extra-chip-{N}
    // Split on "-extra-chip-" which is a fixed suffix, avoiding greedy regex over projectId.
    projectChips.forEach((chip) => {
      if (!chip.id.startsWith('schedule-chip-')) return;
      if (chip.columnIndex >= 8) return; // only day columns
      const extraIdx = chip.id.indexOf('-extra-chip-');
      if (extraIdx === -1) return; // canonical chips are never in day columns
      const inner = chip.id.slice('schedule-chip-'.length, extraIdx); // "{projectId}-{itemIdx}"
      const lastDash = inner.lastIndexOf('-');
      if (lastDash === -1) return;
      const projectId = inner.slice(0, lastDash);
      const itemIdx = parseInt(inner.slice(lastDash + 1), 10);
      if (!projectId || !Number.isFinite(itemIdx)) return;
      // Override may be stored against the extra-copy ID or the canonical chip ID
      const canonicalId = `schedule-chip-${inner}`;
      const mins = chipTimeOverrides?.[chip.id] ?? chipTimeOverrides?.[canonicalId] ?? chip.durationMinutes ?? 0;
      if (!result[projectId]) result[projectId] = {};
      result[projectId][itemIdx] = (result[projectId][itemIdx] ?? 0) + mins;
    });
    return result;
  }, [projectChips, chipTimeOverrides]);

  const hasAnyItems = projects.some(
    (p) => (scheduleLayout?.scheduleItemsByProject?.get(p.id) ?? []).length > 0
  );

  const panel = (
    <div
      className="fixed top-0 right-0 h-full z-60 flex flex-col bg-[#f8fafc] border-l border-[#94a3b8] shadow-2xl"
      style={{ width: '260px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#e5e7eb] shrink-0 bg-white">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
          Schedule Items
        </span>
        <button
          type="button"
          title="Close"
          className="rounded p-1 text-slate-400 hover:text-slate-700 shrink-0"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!hasAnyItems ? (
          <p className="text-[11px] text-slate-400 text-center pt-4">
            No schedule items defined. Add them on the Goal page.
          </p>
        ) : (
          projects.map((project) => {
            const items = scheduleLayout?.scheduleItemsByProject?.get(project.id) ?? [];
            if (!items.length) return null;

            const projectPlaced = placedMinutes[project.id] ?? {};
            const unscheduledCount = items.filter((_, idx) => !(projectPlaced[idx] > 0)).length;
            const bg = project.color || '#d5a6bd';
            const fg = project.textColor || '#000000';

            return (
              <div key={project.id} className="mb-4">
                {/* Project header */}
                <div className="flex items-center justify-between mb-2 pb-1" style={{ borderBottom: `2px solid ${bg}` }}>
                  <span className="text-[11px] font-semibold uppercase text-slate-700">
                    {project.label}
                  </span>
                  {unscheduledCount > 0 && (
                    <span className="text-[10px] font-semibold ml-2 shrink-0 text-slate-400">
                      {unscheduledCount} unscheduled
                    </span>
                  )}
                </div>

                {/* Items */}
                {items.map((item, itemIdx) => {
                  const targetMinutes = parseEstimateLabelToMinutes(item.timeValue) ?? incrementMinutes;
                  const heightPx = durationToPx(incrementMinutes);
                  const placed = projectPlaced[itemIdx] ?? 0;
                  const remainingMinutes = Math.max(0, targetMinutes - placed);
                  const fullyScheduled = placed > 0 && remainingMinutes === 0;
                  const baseName = (item.name ?? '').trim() || project.label;
                  const displayMinutes = fullyScheduled ? targetMinutes : remainingMinutes;
                  const rh = Math.floor(displayMinutes / 60);
                  const rm = displayMinutes % 60;
                  const timeStr = rh === 0 ? `${rm}` : rm === 0 ? `${rh}` : `${rh}.${String(rm).padStart(2, '0')}`;
                  const chipLabel = `${baseName}: ${timeStr}`.toUpperCase();

                  return (
                    <div key={itemIdx} className="mb-1" style={{ height: `${heightPx}px` }}>
                      <div
                        draggable
                        className="h-full rounded-sm flex items-center justify-center px-2 overflow-hidden cursor-grab active:cursor-grabbing font-semibold text-[14px] text-center select-none shadow-sm border border-white"
                        style={{
                          backgroundColor: bg,
                          color: fg,
                          opacity: fullyScheduled ? 0.45 : 1,
                        }}
                        onDragStart={(e) => onDragStart(project.id, itemIdx, e)}
                      >
                        <span className="truncate">{chipLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
