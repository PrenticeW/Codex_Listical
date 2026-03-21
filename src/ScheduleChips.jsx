import React from 'react';

const SCHEDULE_PLACEHOLDER = 'Schedule Item';

export const buildScheduleLayout = (highlightedProjects) => {
  const scheduleItemsByProject = new Map();
  let maxRows = 0;
  highlightedProjects.forEach((project) => {
    const planSummary = project.planSummary ?? {};
    const items = planSummary.scheduleItems ?? planSummary.subprojects;
    const normalized = Array.isArray(items)
      ? items.filter((entry) => {
          const name = (entry?.name ?? '').trim();
          const timeValue = entry?.timeValue ?? '';
          const isPlaceholder = name === SCHEDULE_PLACEHOLDER || name === '';
          return !isPlaceholder || (timeValue && timeValue !== '0.00');
        })
      : [];
    scheduleItemsByProject.set(project.id, normalized);
    if (normalized.length > maxRows) {
      maxRows = normalized.length;
    }
  });
  return { scheduleItemsByProject, maxRows };
};

const renderRowLabelCell = (label, rowId) => (
  <td
    key={`schedule-label-${rowId}`}
    className="border border-[#e5e7eb] px-3 py-2 font-semibold"
    data-row-id-anchor={rowId}
  >
    {label}
  </td>
);

export default function ScheduleChipsRows({
  gridTemplateColumns,
  dayColumnCount,
  stagingColumnConfigs,
  projectMetadata,
  scheduleLayout,
  displayedWeekDays,
  getProjectChipsByColumnIndex,
  highlightedBlockId,
  isRowWithinBlock,
  renderProjectChip,
  isCellSelected,
  handleSleepDragOver,
  handleSleepDrop,
  toggleCellSelection,
  handleCellContextMenu,
  topSpacerRowCount = 2,
}) {
  if (!gridTemplateColumns || !scheduleLayout?.maxRows) return null;
  const { scheduleItemsByProject, maxRows } = scheduleLayout;
  const totalColumnCount = dayColumnCount + stagingColumnConfigs.length;

  const renderSpacerRow = (rowIdx) => (
    <tr key={`schedule-spacer-${rowIdx}`} className="grid" style={{ gridTemplateColumns }}>
      {renderRowLabelCell('', `sched-spacer-${rowIdx}`)}
      {Array.from({ length: totalColumnCount }, (_, index) => (
        <td
          key={`sched-spacer-${rowIdx}-${index}`}
          className="border border-[#e5e7eb] px-3 py-2"
          data-day-column={index}
        />
      ))}
    </tr>
  );

  const chipRows = Array.from({ length: maxRows }, (_, rowIdx) => (
    <tr
      key={`schedule-row-${rowIdx}`}
      className="grid"
      style={{ gridTemplateColumns }}
      data-row-id={`schedule-row-${rowIdx}`}
    >
      {renderRowLabelCell('', `sched-${rowIdx}`)}
      {Array.from({ length: totalColumnCount }, (_, index) => {
        const isDayColumn = index < dayColumnCount;
        const dayLabel = isDayColumn ? displayedWeekDays[index] ?? '' : '';
        const hasDay = isDayColumn && Boolean(dayLabel);
        const stagingIdx = index - dayColumnCount;
        const stagingConfig = !isDayColumn ? stagingColumnConfigs[stagingIdx] : null;
        const isProjectColumn = !isDayColumn && stagingConfig?.type === 'project';
        const isInteractiveColumn = hasDay || isProjectColumn;
        const rowId = `sched-${rowIdx}`;
        const columnBlocks = isInteractiveColumn
          ? getProjectChipsByColumnIndex(index)
          : [];
        const activeBlock =
          isInteractiveColumn && highlightedBlockId != null
            ? columnBlocks.find((block) => block.id === highlightedBlockId)
            : null;
        const isCovered = activeBlock ? isRowWithinBlock(rowId, activeBlock) : false;
        const labels = isInteractiveColumn
          ? columnBlocks
              .filter((block) => block.startRowId === rowId)
              .map((block) => renderProjectChip(block.id, rowId))
          : [];
        const cellSelected = isInteractiveColumn && isCellSelected(index, rowId);
        const cellStyle = {};
        if (isCovered) {
          cellStyle.backgroundColor = '#d9d9d9';
        }
        if (cellSelected) {
          cellStyle.outlineColor = '#000';
          cellStyle.outlineOffset = 0;
        }
        return (
          <td
            key={`sched-row-${rowIdx}-${index}`}
            className={`relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible ${
              cellSelected ? 'outline-2' : ''
            }`}
            style={Object.keys(cellStyle).length ? cellStyle : undefined}
            data-row-id={rowId}
            data-day-column={index}
            data-day={hasDay ? dayLabel : undefined}
            onDragOver={isInteractiveColumn ? handleSleepDragOver : undefined}
            onDrop={isInteractiveColumn ? handleSleepDrop : undefined}
            onClick={isInteractiveColumn ? () => toggleCellSelection(index, rowId) : undefined}
            onContextMenu={
              isInteractiveColumn ? (event) => handleCellContextMenu(event, index, rowId) : undefined
            }
          >
            {labels}
          </td>
        );
      })}
    </tr>
  ));

  return (
    <>
      {Array.from({ length: topSpacerRowCount }, (_, idx) => renderSpacerRow(idx))}
      {chipRows}
    </>
  );
}
