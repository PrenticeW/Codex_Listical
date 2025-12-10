import React from 'react';

export const buildSubprojectLayout = (highlightedProjects) => {
  const subprojectsByProject = new Map();
  let maxRows = 0;
  highlightedProjects.forEach((project) => {
    const planSummary = project.planSummary ?? {};
    const normalized = Array.isArray(planSummary.subprojects)
      ? planSummary.subprojects.filter((entry) => Boolean(entry?.name || entry?.timeValue))
      : [];
    subprojectsByProject.set(project.id, normalized);
    if (normalized.length > maxRows) {
      maxRows = normalized.length;
    }
  });
  return { subprojectsByProject, maxRows };
};

const renderRowLabelCell = (label, rowId) => (
  <td
    key={`subproject-label-${rowId}`}
    className="border border-[#e5e7eb] px-3 py-2 font-semibold"
    data-row-id-anchor={rowId}
  >
    {label}
  </td>
);

export default function SubprojectChipsRows({
  gridTemplateColumns,
  dayColumnCount,
  stagingColumnConfigs,
  projectMetadata,
  subprojectLayout,
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
  if (!gridTemplateColumns || !subprojectLayout?.maxRows) return null;
  const { subprojectsByProject, maxRows } = subprojectLayout;
  const totalColumnCount = dayColumnCount + stagingColumnConfigs.length;

  const renderSpacerRow = (rowIdx) => (
    <tr key={`subproject-spacer-${rowIdx}`} className="grid" style={{ gridTemplateColumns }}>
      {renderRowLabelCell('', `sub-spacer-${rowIdx}`)}
      {Array.from({ length: totalColumnCount }, (_, index) => (
        <td
          key={`sub-spacer-${rowIdx}-${index}`}
          className="border border-[#e5e7eb] px-3 py-2"
          data-day-column={index}
        />
      ))}
    </tr>
  );

  const chipRows = Array.from({ length: maxRows }, (_, rowIdx) => (
    <tr
      key={`subproject-row-${rowIdx}`}
      className="grid"
      style={{ gridTemplateColumns }}
      data-row-id={`subproject-row-${rowIdx}`}
    >
      {renderRowLabelCell('', `sub-${rowIdx}`)}
      {Array.from({ length: totalColumnCount }, (_, index) => {
        const isDayColumn = index < dayColumnCount;
        const dayLabel = isDayColumn ? displayedWeekDays[index] ?? '' : '';
        const hasDay = isDayColumn && Boolean(dayLabel);
        const stagingIdx = index - dayColumnCount;
        const stagingConfig = !isDayColumn ? stagingColumnConfigs[stagingIdx] : null;
        const isProjectColumn = !isDayColumn && stagingConfig?.type === 'project';
        const isInteractiveColumn = hasDay || isProjectColumn;
        const rowId = `sub-${rowIdx}`;
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
            key={`sub-row-${rowIdx}-${index}`}
            className={`relative border border-[#e5e7eb] px-3 py-2 text-center overflow-visible ${
              cellSelected ? 'outline outline-[2px]' : ''
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
