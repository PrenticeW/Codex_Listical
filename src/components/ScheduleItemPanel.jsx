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

  // Count placements per project+itemIdx
  // counts[projectId][itemIdx] = { total, dayColumns }
  // dayColumns counts placements in actual day columns (columnIndex < 8)
  const placementCounts = useMemo(() => {
    const counts = {};
    if (!projectChips) return counts;
    projectChips.forEach((chip) => {
      if (!chip.id.startsWith('schedule-chip-')) return;
      const projectId = chip.projectId;
      if (!projectId) return;
      const prefix = `schedule-chip-${projectId}-`;
      if (!chip.id.startsWith(prefix)) return;
      const rest = chip.id.slice(prefix.length);
      const itemIdx = parseInt(rest, 10);
      if (!Number.isFinite(itemIdx)) return;
      if (!counts[projectId]) counts[projectId] = {};
      if (!counts[projectId][itemIdx]) counts[projectId][itemIdx] = { total: 0, dayColumns: 0 };
      counts[projectId][itemIdx].total += 1;
      if (chip.columnIndex < 8) counts[projectId][itemIdx].dayColumns += 1;
    });
    return counts;
  }, [projectChips]);

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

            const projectCounts = placementCounts[project.id] ?? {};
            const unscheduledCount = items.filter((_, idx) => !(projectCounts[idx]?.dayColumns > 0)).length;
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
                  const minutes = parseEstimateLabelToMinutes(item.timeValue) ?? incrementMinutes;
                  const heightPx = durationToPx(minutes);
                  const entry = projectCounts[itemIdx];
                  const dayCount = entry?.dayColumns ?? 0;
                  const totalCount = entry?.total ?? 0;
                  const scheduledToDayColumn = dayCount > 0;
                  const label = (item.name ?? '').trim() || project.label;

                  return (
                    <div
                      key={itemIdx}
                      className="flex items-stretch gap-2 mb-1"
                      style={{ height: `${heightPx}px` }}
                    >
                      {/* Scaled chip block — draggable, dimmed once placed on a day column */}
                      <div
                        draggable
                        className="flex-1 rounded-sm flex flex-col justify-center px-2 overflow-hidden cursor-grab active:cursor-grabbing"
                        style={{
                          backgroundColor: bg,
                          color: fg,
                          opacity: scheduledToDayColumn ? 0.45 : 1,
                        }}
                        onDragStart={(e) => onDragStart(project.id, itemIdx, e)}
                      >
                        <span className="text-[11px] font-semibold leading-tight truncate">{label}</span>
                        {minutes > 0 && (
                          <span className="text-[10px] opacity-70 leading-tight">
                            {minutes >= 60
                              ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
                              : `${minutes}m`}
                          </span>
                        )}
                      </div>

                      {/* Count badge + add button */}
                      <div className="flex flex-col items-center justify-center gap-0.5 shrink-0 w-8">
                        {dayCount > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">×{dayCount}</span>
                        )}
                        <button
                          type="button"
                          title="Add to calendar"
                          className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          onClick={() => onAddChip(project.id, itemIdx)}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"/>
                          </svg>
                        </button>
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
