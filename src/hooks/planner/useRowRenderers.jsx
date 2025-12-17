import React, { useMemo } from 'react';

// ============================================================
// CONSTANTS
// ============================================================
const BORDER_CLASSES = {
  standard: 'border border-[#ced3d0]',
  noBorder: 'border-0',
};

const CELL_ALIGNMENT = {
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  left: { textAlign: 'left' },
};

const FONT_WEIGHTS = {
  semibold: { fontWeight: 600 },
  bold: { fontWeight: 800 },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Builds border class string with optional top border removal
 */
const buildBorderClass = (removeTopBorder = false) => {
  const topBorderClass = removeTopBorder ? ' border-t-0' : '';
  return `${BORDER_CLASSES.standard}${topBorderClass}`;
};

/**
 * Builds cell style with common patterns
 */
const buildCellStyle = (baseStyle, highlightStyle, extraStyles = {}) => {
  return {
    ...baseStyle,
    ...highlightStyle,
    ...extraStyles,
  };
};

/**
 * Merges row-specific props with base props
 */
const mergeRowProps = (baseProps, className, rowType, extraAttrs = {}) => {
  return {
    ...baseProps,
    className,
    'data-row-type': rowType,
    ...extraAttrs,
  };
};

export default function useRowRenderers({
  totalDays,
  showRecurring,
  showSubprojects,
  ROW_H,
  projectHeaderTotals,
  projectWeeklyQuotas,
  fixedColumnConfig,
  fixedCols,
  sharedInputStyle,
  checkboxInputClass,
  blackDividerStyle,
  applyRowLabelStyle,
  applyWeekBorderStyles,
  getWeekBorderClass,
  getWidthStyle,
  getCellHighlightStyle,
  handleCellMouseDown,
  handleCellActivate,
  handleRowClick,
  handleOverwritePaste,
  createEmptyDayEntries,
  parseEstimateLabelToMinutes,
  formatMinutesToHHmm,
  syncDayEntriesWithTimeValue,
  getProjectSelectStyle,
  getStatusColorStyle,
  statusNames,
  projectNames,
  DARK_HEADER_STYLE,
  ARCHIVE_ROW_STYLE,
  officialProjects = [],
  collapsedGroups = new Set(),
  toggleGroupCollapse = () => {},
}) {
  // Memoize estimate options to avoid recreating on every render
  const estimateOptionElements = useMemo(() => [
    <option key="-">-</option>,
    <option key="custom">Custom</option>,
    <option key="m-1" className="estimate-highlight">
      1 Minute
    </option>,
    ...Array.from({ length: 11 }, (_, i) => (i + 1) * 5).map((m) => (
      <option key={`m-${m}`} className={m === 5 ? 'estimate-highlight' : undefined}>
        {m} Minutes
      </option>
    )),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
      <option key={`h-${h}`}>{h} Hour{h > 1 ? 's' : ''}</option>
    ))
  ], []);

  const EstimateOptions = () => <>{estimateOptionElements}</>;

  // Memoize status options
  const statusOptionElements = useMemo(() => [
    <option key="-">-</option>,
    ...statusNames.map((status) => (
      <option key={status}>{status}</option>
    ))
  ], [statusNames]);

  const StatusOptions = () => <>{statusOptionElements}</>;

  // Memoize project options
  const projectOptionElements = useMemo(() => [
    <option key="-">-</option>,
    ...projectNames.map((name) => (
      <option key={name}>{name.toUpperCase()}</option>
    ))
  ], [projectNames]);

  const ProjectOptions = () => <>{projectOptionElements}</>;

  // Memoize subproject lookup to avoid expensive .find() on every render
  const subprojectsByProject = useMemo(() => {
    const map = new Map();
    officialProjects.forEach((p) => {
      const projectName = p.projectNickname || p.projectName || p.text;
      const key = (projectName ?? '').trim().toLowerCase();
      const subprojects = Array.isArray(p.planSummary?.subprojects)
        ? p.planSummary.subprojects.filter((entry) => Boolean(entry?.name))
        : [];
      map.set(key, subprojects);
    });
    return map;
  }, [officialProjects]);

  const SubprojectOptions = ({ projectSelection }) => {
    // If no project is selected, show dash only
    if (!projectSelection || projectSelection === '-') {
      return <option>-</option>;
    }

    const normalizeProjectKey = (name) => (name ?? '').trim().toLowerCase();
    const selectedProjectKey = normalizeProjectKey(projectSelection);
    const subprojects = subprojectsByProject.get(selectedProjectKey) || [];

    if (subprojects.length === 0) {
      return <option>-</option>;
    }

    return (
      <>
        <option>-</option>
        {subprojects.map((subproject, index) => (
          <option key={`${subproject.name}-${index}`}>{subproject.name}</option>
        ))}
      </>
    );
  };

  // ============================================================
  // HEADER ROW CONFIG - Defines styles and content for different header types
  // ============================================================
  const HEADER_ROW_CONFIGS = {
    projectHeader: {
      bgColor: '#d5a6bd',
      showData: true,  // Shows project name, quota, totals
      labelInCheck: true,  // Project name goes in check column
    },
    projectGeneral: {
      bgColor: '#f2e5eb',
      label: 'General',
      labelInTask: true,  // "General" goes in task column
    },
    projectUnscheduled: {
      bgColor: '#f2e5eb',
      label: 'Unscheduled',
      labelInTask: true,  // "Unscheduled" goes in task column
    },
    inboxHeader: {
      style: DARK_HEADER_STYLE,
      label: 'Inbox',
      colSpan: true,  // Spans all fixed columns
    },
    archiveHeader: {
      style: DARK_HEADER_STYLE,
      label: 'Archive',
      colSpan: true,  // Spans all fixed columns
    },
    // Archived versions of project headers
    archivedProjectHeader: {
      bgColor: '#d5a6bd',
      showData: true,
      labelInCheck: true,
      isArchived: true,
    },
    archivedProjectGeneral: {
      bgColor: '#f2e5eb',
      label: 'General',
      labelInTask: true,
      isArchived: true,
    },
    archivedProjectUnscheduled: {
      bgColor: '#f2e5eb',
      label: 'Unscheduled',
      labelInTask: true,
      isArchived: true,
    },
  };

  // ============================================================
  // UNIFIED HEADER ROW RENDERER - Handles all 5 header types
  // ============================================================
  const renderUnifiedHeaderRow = (variant) => {
    const HeaderRowComponent = React.memo(({
      row,
      rowId,
      rowNumber,
      isRowSelected,
      rowPropsLocal,
      cellMetadataProps,
      withCellSelectionClass,
      cellClickProps,
      tableRow,
      handleRowMouseDown,
    }) => {
    const config = HEADER_ROW_CONFIGS[variant];
    const baseStyle = config.style || { backgroundColor: config.bgColor };

    // For colSpan headers (inbox, archive) - simplified layout
    if (config.colSpan) {
      return (
        <tr
          {...rowPropsLocal}
          className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}
          data-row-type="header"
          data-row-variant={variant}
          data-header-style="colspan"
        >
          <td
            {...cellMetadataProps('rowLabel')}
            className={withCellSelectionClass(
              `font-bold text-center border-0${isRowSelected ? ' selected-cell' : ''}`,
              'rowLabel'
            )}
            style={getWidthStyle('rowLabel', applyRowLabelStyle({
              ...baseStyle,
              ...getCellHighlightStyle(rowId, 'rowLabel'),
            }))}
            tabIndex={0}
            onFocus={() =>
              handleCellActivate(rowId, 'rowLabel', {
                highlightRow: true,
                preserveSelection: true,
              })
            }
            onMouseDown={handleRowMouseDown}
            data-cell-purpose="row-number"
          >
            {rowNumber}
          </td>
          <td
            className={withCellSelectionClass('font-bold px-2 border-0', 'header-fixed')}
            colSpan={fixedCols - 1}
            style={{
              ...blackDividerStyle,
              ...baseStyle,
              ...getCellHighlightStyle(rowId, 'header-fixed'),
              paddingLeft: 8,
              fontWeight: 800,
            }}
            {...cellClickProps('header-fixed')}
            data-cell-purpose="header-label"
            data-header-label={config.label}
          >
            {config.label}
          </td>
          <td
            className={withCellSelectionClass('border-0', 'header-span')}
            colSpan={totalDays}
            style={{ ...baseStyle, ...getCellHighlightStyle(rowId, 'header-span') }}
            {...cellClickProps('header-span')}
            data-cell-purpose="header-day-span"
          ></td>
        </tr>
      );
    }

    // For project headers with data (projectHeader, projectGeneral, projectUnscheduled)
    // Use archivedTotal if this is an archived row, otherwise use current totals
    const projectRollupValue = config.showData
      ? (config.isArchived ? (row.archivedTotal ?? '0.00') : (projectHeaderTotals[rowId] ?? '0.00'))
      : null;
    const projectLabel = config.showData ? (row.projectNickname || row.projectName) : null;
    const rawQuota = config.showData ? (projectWeeklyQuotas?.get(projectLabel) ?? '0.00') : null;
    const projectQuota = config.showData
      ? (typeof rawQuota === 'number'
        ? rawQuota.toFixed(2)
        : typeof rawQuota === 'string' && rawQuota.includes('.')
          ? parseFloat(rawQuota).toFixed(2)
          : rawQuota)
      : null;

    // Expand/collapse functionality for archived project headers
    const isCollapsed = row.groupId ? collapsedGroups.has(row.groupId) : false;
    const expandIcon = isCollapsed ? '▶' : '▼';

    return (
      <tr
        {...rowPropsLocal}
        className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}
        data-row-type="header"
        data-row-variant={variant}
        data-header-style="project"
        data-project-name={projectLabel || undefined}
      >
        <td
          {...cellMetadataProps('rowLabel')}
          className={`text-center ${config.showData ? 'font-semibold' : ''} border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
          onMouseDown={handleRowMouseDown}
          onClick={(event) => {
            console.log('[ROW NUMBER CLICK] Row number clicked, index:', tableRow.index);
            handleRowClick(event, tableRow.index);
          }}
          data-cell-purpose="row-number"
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass(
            `${config.labelInCheck ? 'font-extrabold px-2 text-[12px]' : ''}`,
            'check'
          )}
          style={getWidthStyle('check', {
            backgroundColor: baseStyle.backgroundColor,
            ...getCellHighlightStyle(rowId, 'check'),
            ...(config.labelInCheck ? { overflow: 'visible', whiteSpace: 'nowrap', fontWeight: 800, paddingLeft: 8 } : {}),
          })}
          {...cellClickProps('check')}
          data-cell-purpose={config.labelInCheck ? 'header-project-name' : 'header-decoration'}
          data-display-only="true"
        >
          {config.labelInCheck && row.isGroupHeader && row.groupId ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleGroupCollapse(row.groupId);
              }}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              {expandIcon} {projectLabel}
            </span>
          ) : (
            config.labelInCheck ? projectLabel : ''
          )}
        </td>
        <td
          className={withCellSelectionClass('', 'project')}
          style={getWidthStyle('project', { backgroundColor: baseStyle.backgroundColor, ...getCellHighlightStyle(rowId, 'project') })}
          {...cellClickProps('project')}
          data-cell-purpose="header-decoration"
          data-display-only="true"
        ></td>
        {showSubprojects && (
          <td
            className={withCellSelectionClass('', 'subprojects')}
            style={getWidthStyle('subprojects', { backgroundColor: baseStyle.backgroundColor, ...getCellHighlightStyle(rowId, 'subprojects') })}
            {...cellClickProps('subprojects')}
            data-cell-purpose="header-decoration"
            data-display-only="true"
          ></td>
        )}
        <td
          className={withCellSelectionClass('', 'status')}
          style={getWidthStyle('status', { backgroundColor: baseStyle.backgroundColor, ...getCellHighlightStyle(rowId, 'status') })}
          {...cellClickProps('status')}
          data-cell-purpose="header-decoration"
          data-display-only="true"
        ></td>
        <td
          className={withCellSelectionClass(
            `${config.labelInTask ? 'px-2 font-extrabold text-[12px]' : ''}`,
            'task'
          )}
          style={getWidthStyle('task', {
            backgroundColor: baseStyle.backgroundColor,
            ...getCellHighlightStyle(rowId, 'task'),
            ...(config.labelInTask ? { fontWeight: 800, paddingLeft: 8 } : {}),
          })}
          {...cellClickProps('task')}
          data-cell-purpose={config.labelInTask ? 'header-section-label' : 'header-decoration'}
          data-header-label={config.labelInTask ? config.label : undefined}
          data-display-only="true"
        >
          {config.labelInTask ? config.label : ''}
        </td>
        {showRecurring && (
          <td
            className={withCellSelectionClass('', 'recurring')}
            style={getWidthStyle('recurring', { backgroundColor: baseStyle.backgroundColor, ...getCellHighlightStyle(rowId, 'recurring') })}
            {...cellClickProps('recurring')}
            data-cell-purpose="header-decoration"
            data-display-only="true"
          ></td>
        )}
        <td
          className={withCellSelectionClass(
            `${config.showData ? 'text-right pr-2 font-semibold' : ''}`,
            'estimate'
          )}
          style={getWidthStyle('estimate', {
            backgroundColor: baseStyle.backgroundColor,
            ...getCellHighlightStyle(rowId, 'estimate'),
            ...(config.showData ? { textAlign: 'right', paddingRight: 8, fontWeight: 600 } : {}),
          })}
          {...cellClickProps('estimate')}
          data-cell-purpose={config.showData ? 'header-project-total' : 'header-decoration'}
          data-total-value={config.showData ? projectRollupValue : undefined}
          data-display-only="true"
        >
          {config.showData ? projectRollupValue : ''}
        </td>
        <td
          className={withCellSelectionClass('border border-[#ced3d0]', 'timeValue')}
          style={getWidthStyle('timeValue', {
            backgroundColor: baseStyle.backgroundColor,
            ...blackDividerStyle,
            ...getCellHighlightStyle(rowId, 'timeValue'),
            ...(config.showData
              ? { textAlign: 'left', paddingLeft: 8, fontWeight: 600 }
              : { textAlign: 'right', paddingRight: 8 }
            ),
          })}
          {...cellClickProps('timeValue')}
          data-cell-purpose={config.showData ? 'header-project-quota' : 'header-decoration'}
          data-quota-value={config.showData ? projectQuota : undefined}
          data-display-only="true"
        >
          {config.showData ? `of ${projectQuota}` : ''}
        </td>
        {Array.from({ length: totalDays }).map((_, i) => (
          <td
            key={`${rowId}-hdr-${i}`}
            style={{
              ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
              ...getCellHighlightStyle(rowId, `day-${i}`),
            }}
            className={withCellSelectionClass(
              `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
              `day-${i}`
            )}
            {...cellClickProps(`day-${i}`)}
            data-cell-purpose="header-decoration"
            data-day-index={i}
            data-display-only="true"
          >
            <input 
              type="text"
              className={sharedInputStyle}
              defaultValue=""
              onFocus={() => handleCellActivate(rowId, `day-${i}`)}
              onPaste={(event) =>
                handleOverwritePaste(event, (text) => {
                  event.currentTarget.value = text;
                })
              }
            />
          </td>
        ))}
      </tr>
    );
    }, (prevProps, nextProps) => {
      // Custom comparison: only re-render if relevant props changed
      return (
        prevProps.rowId === nextProps.rowId &&
        prevProps.rowNumber === nextProps.rowNumber &&
        prevProps.isRowSelected === nextProps.isRowSelected &&
        prevProps.row === nextProps.row &&
        JSON.stringify(prevProps.rowPropsLocal) === JSON.stringify(nextProps.rowPropsLocal)
      );
    });

    return (props) => <HeaderRowComponent {...props} />;
  };

  // ============================================================
  // OLD HEADER RENDERERS REMOVED - Now using renderUnifiedHeaderRow
  // ============================================================

  // ============================================================
  // UNIFIED TASK ROW RENDERER - Handles both projectTask and inboxItem
  // ============================================================
  const TaskRowComponent = ({
    row,
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
    tableRow,
    commitRowUpdate,
    ensureInteractionMarked,
    previousRow,
    handleRowMouseDown,
  }) => {
    const dayEntries = Array.isArray(row.dayEntries) ? row.dayEntries : [];
    const isCustomEstimate = row.estimate === 'Custom';
    const isInboxRow = previousRow && previousRow.type === 'inboxHeader';
    const borderClass = buildBorderClass(isInboxRow);

    const updateTaskName = (value) => {
      commitRowUpdate({ taskName: value }, { markInteraction: true });
    };

    const updateDayEntry = (dayIndex, value) => {
      commitRowUpdate(
        (currentRow) => {
          const existingEntries = Array.isArray(currentRow.dayEntries)
            ? [...currentRow.dayEntries]
            : createEmptyDayEntries(totalDays);
          existingEntries[dayIndex] = value;
          const updates = { dayEntries: existingEntries };
          if ((value ?? '').trim() && currentRow.status === 'Not Scheduled') {
            updates.status = 'Scheduled';
          }
          return updates;
        },
        { markInteraction: true }
      );
    };

    const updateTimeValue = (value) => {
      if (!isCustomEstimate) return;
      commitRowUpdate(
        (currentRow) => {
          const updates = { timeValue: value };
          const syncedEntries = syncDayEntriesWithTimeValue(
            currentRow.dayEntries,
            value,
            currentRow.timeValue
          );
          if (syncedEntries !== currentRow.dayEntries) {
            updates.dayEntries = syncedEntries;
          }
          return updates;
        },
        { markInteraction: true }
      );
    };

    return (
      <tr
        {...rowPropsLocal}
        className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}
        data-row-type="task"
        data-is-inbox-item={isInboxRow || undefined}
        data-task-status={row.status}
        data-project={row.projectSelection}
      >
        <td
          {...cellMetadataProps('rowLabel')}
          className={`text-center align-middle ${borderClass}${isRowSelected ? ' selected-cell' : ''}`}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
          onMouseDown={handleRowMouseDown}
          onClick={(event) => {
            console.log('[ROW NUMBER CLICK] Row number clicked, index:', tableRow.index);
            handleRowClick(event, tableRow.index);
          }}
          data-cell-purpose="row-number"
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass(`${borderClass} p-0 check-cell`, 'check')}
          style={getWidthStyle('check', getCellHighlightStyle(rowId, 'check'))}
          {...cellClickProps('check')}
          data-cell-purpose="task-checkbox"
          data-interactive="true"
        >
          <div className="flex h-full w-full items-center justify-center">
            <input
              type="checkbox"
              className={checkboxInputClass}
              tabIndex={0}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => handleCellActivate(rowId, 'check')}
              onChange={ensureInteractionMarked}
            />
          </div>
        </td>
        <td
          style={getWidthStyle('project', getCellHighlightStyle(rowId, 'project'))}
          className={withCellSelectionClass(`${borderClass} p-0`, 'project')}
          {...cellClickProps('project')}
          data-cell-purpose="project-selector"
          data-interactive="true"
          data-current-value={row.projectSelection}
        >
          <select
            className={`${sharedInputStyle} uppercase project-pill-select`}
            style={getProjectSelectStyle(row.projectSelection)}
            value={row.projectSelection ?? '-'}
            tabIndex={0}
            onMouseDown={() => handleCellActivate(rowId, 'project')}
            onChange={(event) => {
              const nextValue = event.target.value;
              commitRowUpdate({ projectSelection: nextValue }, { markInteraction: true });
            }}
          >
            <ProjectOptions />
          </select>
        </td>
        {showSubprojects && (
          <td
            style={getWidthStyle('subprojects', getCellHighlightStyle(rowId, 'subprojects'))}
            className={withCellSelectionClass(`${borderClass} p-0`, 'subprojects')}
            {...cellClickProps('subprojects')}
            data-cell-purpose="subproject-selector"
            data-interactive="true"
            data-current-value={row.subprojectSelection}
          >
            <select
              className={sharedInputStyle}
              value={row.subprojectSelection ?? '-'}
              tabIndex={0}
              onMouseDown={() => handleCellActivate(rowId, 'subprojects')}
              onChange={(event) => {
                const nextValue = event.target.value;
                commitRowUpdate({ subprojectSelection: nextValue }, { markInteraction: true });
              }}
            >
              <SubprojectOptions projectSelection={row.projectSelection} />
            </select>
          </td>
        )}
        <td
          style={getWidthStyle('status', getCellHighlightStyle(rowId, 'status'))}
          className={withCellSelectionClass(`${borderClass} p-0`, 'status')}
          {...cellClickProps('status')}
          data-cell-purpose="status-selector"
          data-interactive="true"
          data-current-value={row.status}
        >
          <div className="status-pill-container">
            <select
              className="status-pill-select"
              style={getStatusColorStyle(row.status)}
              value={row.status ?? '-'}
              tabIndex={0}
              onMouseDown={() => handleCellActivate(rowId, 'status')}
              onChange={(event) => {
                const nextValue = event.target.value;
                commitRowUpdate({ status: nextValue }, { markInteraction: true });
              }}
            >
              <StatusOptions />
            </select>
          </div>
        </td>
        <td
          style={getWidthStyle('task', getCellHighlightStyle(rowId, 'task'))}
          className={withCellSelectionClass(`${borderClass} p-0`, 'task')}
          {...cellClickProps('task')}
          data-cell-purpose="task-name-input"
          data-interactive="true"
        >
          <input
            type="text"
            className={sharedInputStyle}
            defaultValue={row.taskName ?? ''}
            key={`${rowId}-task`}
            tabIndex={0}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => handleCellActivate(rowId, 'task')}
            onBlur={(event) => updateTaskName(event.target.value)}
            onPaste={(event) =>
              handleOverwritePaste(event, (text) => updateTaskName(text))
            }
          />
        </td>
        {showRecurring && (
          <td
            className={withCellSelectionClass(`${borderClass} p-0`, 'recurring')}
            style={getWidthStyle('recurring', getCellHighlightStyle(rowId, 'recurring'))}
            {...cellClickProps('recurring')}
            data-cell-purpose="recurring-toggle"
            data-interactive="true"
            data-is-recurring={row.recurring === 'Recurring' || undefined}
          >
            <div className="flex h-full w-full items-center justify-center">
              <input
                type="checkbox"
                className={checkboxInputClass}
                checked={row.recurring === 'Recurring'}
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => handleCellActivate(rowId, 'recurring')}
                onChange={(event) => {
                  const nextValue = event.target.checked ? 'Recurring' : 'Not Recurring';
                  commitRowUpdate({ recurring: nextValue }, { markInteraction: true });
                }}
              />
            </div>
          </td>
        )}
        <td
          style={getWidthStyle('estimate', getCellHighlightStyle(rowId, 'estimate'))}
          className={withCellSelectionClass(`${borderClass} p-0`, 'estimate')}
          {...cellClickProps('estimate')}
          data-cell-purpose="estimate-selector"
          data-interactive="true"
          data-current-value={row.estimate}
        >
          <select
            className={sharedInputStyle}
            value={row.estimate ?? '-'}
            tabIndex={0}
            onMouseDown={() => handleCellActivate(rowId, 'estimate')}
            onChange={(event) => {
              const nextValue = event.target.value;
              commitRowUpdate(
                (currentRow) => {
                  const updates = { estimate: nextValue };
                  const minutes = parseEstimateLabelToMinutes(nextValue);
                  let nextTimeValue;
                  if (minutes != null) {
                    nextTimeValue = formatMinutesToHHmm(minutes);
                  } else if (nextValue === 'Custom') {
                    nextTimeValue = '0.00';
                  } else {
                    nextTimeValue = '0.00';
                  }
                  updates.timeValue = nextTimeValue;
                  const syncedEntries = syncDayEntriesWithTimeValue(
                    currentRow.dayEntries,
                    nextTimeValue,
                    currentRow.timeValue
                  );
                  if (syncedEntries !== currentRow.dayEntries) {
                    updates.dayEntries = syncedEntries;
                  }
                  return updates;
                },
                { markInteraction: true }
              );
            }}
          >
            <EstimateOptions />
          </select>
        </td>
        <td
          className={withCellSelectionClass(`${borderClass} p-0`, 'timeValue')}
          style={getWidthStyle('timeValue', buildCellStyle(
            blackDividerStyle,
            getCellHighlightStyle(rowId, 'timeValue'),
            { ...CELL_ALIGNMENT.right, paddingRight: 8 }
          ))}
          {...cellClickProps('timeValue')}
          data-cell-purpose="time-value-input"
          data-interactive={isCustomEstimate ? 'true' : 'false'}
          data-is-custom={isCustomEstimate || undefined}
        >
          <input
            type="text"
            className={`${sharedInputStyle} text-right pr-2`}
            value={row.timeValue ?? '0.00'}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => handleCellActivate(rowId, 'timeValue')}
            onChange={(event) => {
              if (!isCustomEstimate) return;
              updateTimeValue(event.target.value);
            }}
            onPaste={(event) => {
              if (!isCustomEstimate) return;
              handleOverwritePaste(event, (text) => updateTimeValue(text));
            }}
            readOnly={!isCustomEstimate}
          />
        </td>
        {Array.from({ length: totalDays }).map((_, i) => (
          <td
            key={`${rowId}-task-${i}`}
            style={{
              ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
              ...getCellHighlightStyle(rowId, `day-${i}`),
              paddingRight: 8,
            }}
            data-cell-purpose="day-time-entry"
            data-day-index={i}
            data-interactive="true"
            className={withCellSelectionClass(
              `${getWeekBorderClass(i, borderClass)} p-0`,
              `day-${i}`
            )}
            {...cellClickProps(`day-${i}`)}
          >
            <input
              type="text"
              className={`${sharedInputStyle} text-right pr-2`}
              defaultValue={dayEntries[i] ?? ''}
              key={`${rowId}-day-${i}`}
              onClick={(e) => e.stopPropagation()}
              onFocus={() => handleCellActivate(rowId, `day-${i}`)}
              onBlur={(event) => updateDayEntry(i, event.target.value)}
              onPaste={(event) =>
                handleOverwritePaste(event, (text) => updateDayEntry(i, text))
              }
              data-time-entry="true"
            />
          </td>
        ))}
      </tr>
    );
  };

  const renderUnifiedTaskRow = (props) => <TaskRowComponent {...props} />;

  // ============================================================
  // OLD TASK RENDERERS REMOVED - Now using renderUnifiedTaskRow
  // ============================================================

  const ArchiveRowComponent = React.memo(({
    row,
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
    previousRow,
    tableRow,
    handleRowMouseDown,
  }) => {
    const isArchiveSection = previousRow && (previousRow.type === 'archiveHeader' || previousRow.type === 'archiveRow');
    const borderClass = buildBorderClass(isArchiveSection);
    return (
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={`text-center align-middle ${borderClass}${isRowSelected ? ' selected-cell' : ''}`}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(buildCellStyle(
            ARCHIVE_ROW_STYLE,
            getCellHighlightStyle(rowId, 'rowLabel')
          )))}
          tabIndex={0}
          onMouseDown={handleRowMouseDown}
          onClick={(event) => {
            event.preventDefault();
            handleRowClick(event, tableRow.index);
          }}
        >
          {rowNumber}
        </td>
        {fixedColumnConfig.map(({ key, className }, colIdx) => {
          const isCollapsed = row.groupId ? collapsedGroups.has(row.groupId) : false;
          const expandIcon = isCollapsed ? '▶' : '▼';

          const cellContent = (() => {
            if (colIdx === 0) {
              // Add expand/collapse icon if this is a group header
              if (row.isGroupHeader && row.groupId) {
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroupCollapse(row.groupId);
                    }}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    {expandIcon} {row.archiveWeekLabel ?? ''}
                  </span>
                );
              }
              return row.archiveWeekLabel ?? '';
            }
            if (key === 'task') return row.archiveLabel ?? '';
            if (key === 'estimate') return row.archiveTotalHours ?? '0.00';
            if (key === 'timeValue') {
              const min = row.archiveWeeklyMin ?? '0.00';
              const max = row.archiveWeeklyMax ?? '0.00';
              return `of ${min} - ${max}`;
            }
            return '';
          })();
          const extraStyles =
            colIdx === 0
              ? { overflow: 'visible', whiteSpace: 'nowrap', paddingLeft: 16 }
              : key === 'task'
                ? { paddingLeft: 16 }
                : {};
          const alignmentStyle =
            key === 'estimate'
              ? { ...CELL_ALIGNMENT.right, ...FONT_WEIGHTS.bold }
              : key === 'timeValue'
                ? CELL_ALIGNMENT.left
                : {};
          return (
            <td
              key={`${rowId}-${key}`}
              className={withCellSelectionClass(
                `${borderClass} ${className ?? ''} font-semibold px-2`,
                key
              )}
              style={getWidthStyle(key, buildCellStyle(
                ARCHIVE_ROW_STYLE,
                getCellHighlightStyle(rowId, key),
                {
                  ...(key === 'timeValue' ? blackDividerStyle : {}),
                  ...extraStyles,
                  ...alignmentStyle,
                }
              ))}
              {...cellClickProps(key)}
            >
              {cellContent}
            </td>
          );
        })}
        {Array.from({ length: totalDays }).map((_, i) => (
          <td
            key={`${rowId}-archive-${i}`}
            className={withCellSelectionClass(
              `${getWeekBorderClass(i, borderClass)} p-0`,
              `day-${i}`
            )}
            style={applyWeekBorderStyles(i, getWidthStyle(`day-${i}`, buildCellStyle(
              { backgroundColor: '#ffffff' },
              getCellHighlightStyle(rowId, `day-${i}`)
            )))}
            {...cellClickProps(`day-${i}`)}
          ></td>
        ))}
      </tr>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison: only re-render if relevant props changed
    return (
      prevProps.rowId === nextProps.rowId &&
      prevProps.rowNumber === nextProps.rowNumber &&
      prevProps.isRowSelected === nextProps.isRowSelected &&
      prevProps.row === nextProps.row &&
      prevProps.previousRow === nextProps.previousRow &&
      JSON.stringify(prevProps.rowPropsLocal) === JSON.stringify(nextProps.rowPropsLocal)
    );
  });

  const renderArchiveRow = (props) => <ArchiveRowComponent {...props} />;

  return {
    // Use unified header renderer for all header types
    projectHeader: renderUnifiedHeaderRow('projectHeader'),
    projectGeneral: renderUnifiedHeaderRow('projectGeneral'),
    projectUnscheduled: renderUnifiedHeaderRow('projectUnscheduled'),
    inboxHeader: renderUnifiedHeaderRow('inboxHeader'),
    archiveHeader: renderUnifiedHeaderRow('archiveHeader'),
    // Archived header renderers
    archivedProjectHeader: renderUnifiedHeaderRow('archivedProjectHeader'),
    archivedProjectGeneral: renderUnifiedHeaderRow('archivedProjectGeneral'),
    archivedProjectUnscheduled: renderUnifiedHeaderRow('archivedProjectUnscheduled'),
    // Use unified task renderer for both task types
    projectTask: renderUnifiedTaskRow,
    inboxItem: renderUnifiedTaskRow,
    // Keep archive row separate (different data structure)
    archiveRow: renderArchiveRow,
  };
}
