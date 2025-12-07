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

const renderDayCells = (dayColumnCount, prefix) =>
  Array.from({ length: dayColumnCount }, (_, idx) => (
    <td
      key={`${prefix}-day-${idx}`}
      className="border border-[#e5e7eb] px-3 py-2"
      style={{ minHeight: '32px' }}
      data-day-column={idx}
    />
  ));

const renderRowLabelCell = (label, rowId) => (
  <td
    key={`subproject-label-${rowId}`}
    className="border border-[#e5e7eb] px-3 py-2 font-semibold"
    data-row-id-anchor={rowId}
  >
    {label}
  </td>
);

const renderSubprojectCell = (column, rowIdx, subprojectsByProject, projectMetadata) => {
  if (column.type !== 'project') {
    return (
      <td
        key={`subproject-empty-${column.id}-${rowIdx}`}
        className="border border-[#e5e7eb] px-3 py-2"
      />
    );
  }
  const subprojects = subprojectsByProject.get(column.project.id) ?? [];
  const subproject = subprojects[rowIdx];
  if (!subproject) {
    return (
      <td
        key={`subproject-empty-${column.id}-${rowIdx}`}
        className="border border-[#e5e7eb] px-3 py-2"
      />
    );
  }
  const metadata = projectMetadata.get(column.project.id);
  const backgroundColor = metadata?.color ?? column.project.color ?? '#d9d9d9';
  const textColor = metadata?.textColor ?? '#000';
  const label = (subproject.name ?? '').trim() || 'Subproject';
  return (
    <td
      key={`subproject-${column.id}-${rowIdx}`}
      className="border border-[#e5e7eb] p-1"
      style={{ minHeight: '40px' }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center"
      >
        <div
          className="relative flex h-full w-full cursor-default select-none items-center justify-center rounded border border-transparent px-2 py-1 text-center text-[11px] font-semibold shadow-sm"
          style={{
            backgroundColor,
            color: textColor,
          }}
        >
          {label}
        </div>
      </div>
    </td>
  );
};

export default function SubprojectChipsRows({
  gridTemplateColumns,
  dayColumnCount,
  stagingColumnConfigs,
  projectMetadata,
  subprojectLayout,
}) {
  if (!gridTemplateColumns || !subprojectLayout?.maxRows) return null;
  const { subprojectsByProject, maxRows } = subprojectLayout;

  const allowDropOnRow = (event) => {
    event.preventDefault();
    const rowId = event.currentTarget?.dataset?.rowId;
    const column = event.target?.dataset?.dayColumn;
    console.log('[subproject-dnd] drag over', {
      rowId,
      column,
      targetTag: event.target?.tagName,
      targetRowId: event.target?.dataset?.rowId,
    });
  };

  const handleDragEnterRow = (event) => {
    const rowId = event.currentTarget?.dataset?.rowId;
    const column = event.target?.dataset?.dayColumn;
    console.log('[subproject-dnd] drag enter', {
      rowId,
      column,
      targetTag: event.target?.tagName,
      targetRowId: event.target?.dataset?.rowId,
    });
  };

  const handleDropOnRow = (event) => {
    event.preventDefault();
    const rowId = event.currentTarget?.dataset?.rowId;
    const column = event.target?.dataset?.dayColumn;
    console.log('[subproject-dnd] drop', {
      rowId,
      column,
      dataTypes: event.dataTransfer?.types,
    });
  };

  const renderBlankRow = (key) => (
    <tr
      key={`subproject-gap-${key}`}
      className="grid"
      style={{ gridTemplateColumns }}
      onDragOver={allowDropOnRow}
      onDragEnter={handleDragEnterRow}
      onDrop={handleDropOnRow}
      data-row-id={`subproject-gap-${key}`}
    >
      {renderRowLabelCell('', `gap-${key}`)}
      {renderDayCells(dayColumnCount, `gap-${key}`)}
      {stagingColumnConfigs.map((column) => (
        <td
          key={`subproject-gap-${key}-${column.id}`}
          className="border border-[#e5e7eb] px-3 py-2"
        />
      ))}
    </tr>
  );

  const chipRows = Array.from({ length: maxRows }, (_, rowIdx) => (
    <tr
      key={`subproject-row-${rowIdx}`}
      className="grid"
      style={{ gridTemplateColumns }}
      onDragOver={allowDropOnRow}
      onDragEnter={handleDragEnterRow}
      onDrop={handleDropOnRow}
      data-row-id={`subproject-row-${rowIdx}`}
    >
      {renderRowLabelCell('', `sub-${rowIdx}`)}
      {renderDayCells(dayColumnCount, `sub-${rowIdx}`)}
      {stagingColumnConfigs.map((column) =>
        renderSubprojectCell(column, rowIdx, subprojectsByProject, projectMetadata)
      )}
    </tr>
  ));

  return (
    <>
      {renderBlankRow('pre-1')}
      {renderBlankRow('pre-2')}
      {chipRows}
    </>
  );
}
