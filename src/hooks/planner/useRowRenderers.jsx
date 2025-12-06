import React from 'react';

export default function useRowRenderers({
  totalDays,
  showRecurring,
  ROW_H,
  projectHeaderTotals,
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
  DARK_HEADER_STYLE,
  ARCHIVE_ROW_STYLE,
}) {
  const EstimateOptions = () => (
    <>
      <option>-</option>
      <option key="custom">Custom</option>
      <option key="m-1" className="estimate-highlight">
        1 Minute
      </option>
      {Array.from({ length: 11 }, (_, i) => (i + 1) * 5).map((m) => (
        <option key={`m-${m}`} className={m === 5 ? 'estimate-highlight' : undefined}>
          {m} Minutes
        </option>
      ))}
      {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
        <option key={`h-${h}`}>{h} Hour{h > 1 ? 's' : ''}</option>
      ))}
    </>
  );

  const StatusOptions = () => (
    <>
      <option>-</option>
      {statusNames.map((status) => (
        <option key={status}>{status}</option>
      ))}
    </>
  );

  const renderProjectHeaderRow = ({
    row,
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
    tableRow,
  }) => {
    const projectRollupValue = projectHeaderTotals[rowId] ?? '0.00';
    return (
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={withCellSelectionClass(
            `text-center font-semibold border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
            'rowLabel'
          )}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
          tabIndex={0}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
          onFocus={() =>
            handleCellActivate(rowId, 'rowLabel', {
              highlightRow: true,
              preserveSelection: true,
            })
          }
          onClick={(event) => handleRowClick(event, tableRow.index)}
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass('bg-[#d5a6bd] font-extrabold px-2 text-[12px]', 'check')}
          style={getWidthStyle('check', {
            ...getCellHighlightStyle(rowId, 'check'),
            overflow: 'visible',
            whiteSpace: 'nowrap',
            fontWeight: 800,
            paddingLeft: 8,
          })}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'check')}
          {...cellClickProps('check')}
        >
          {row.projectName}
        </td>
        <td
          className={withCellSelectionClass('bg-[#d5a6bd]', 'project')}
          style={getWidthStyle('project', getCellHighlightStyle(rowId, 'project'))}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'project')}
          {...cellClickProps('project')}
        ></td>
        <td
          className={withCellSelectionClass('bg-[#d5a6bd]', 'status')}
          style={getWidthStyle('status', getCellHighlightStyle(rowId, 'status'))}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'status')}
          {...cellClickProps('status')}
        ></td>
        <td
          className={withCellSelectionClass('bg-[#d5a6bd]', 'task')}
          style={getWidthStyle('task', getCellHighlightStyle(rowId, 'task'))}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'task')}
          {...cellClickProps('task')}
        ></td>
        {showRecurring && (
          <td
            className={withCellSelectionClass('bg-[#d5a6bd]', 'recurring')}
            style={getWidthStyle('recurring', getCellHighlightStyle(rowId, 'recurring'))}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'recurring')}
            {...cellClickProps('recurring')}
          ></td>
        )}
        <td
          className={withCellSelectionClass('bg-[#d5a6bd] text-right pr-2 font-semibold', 'estimate')}
          style={getWidthStyle('estimate', {
            ...getCellHighlightStyle(rowId, 'estimate'),
            textAlign: 'right',
            paddingRight: 8,
            fontWeight: 600,
          })}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'estimate')}
          {...cellClickProps('estimate')}
        >
          {projectRollupValue}
        </td>
        <td
          className={withCellSelectionClass('bg-[#d5a6bd] border border-[#ced3d0]', 'timeValue')}
          style={getWidthStyle('timeValue', {
            ...blackDividerStyle,
            ...getCellHighlightStyle(rowId, 'timeValue'),
            textAlign: 'left',
            paddingLeft: 8,
            fontWeight: 600,
          })}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'timeValue')}
          {...cellClickProps('timeValue')}
        >
          of 0.00
        </td>
        {Array.from({ length: totalDays }).map((_, i) => (
          <td
            key={`${rowId}-hdr-${i}`}
            style={{
              ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
              ...getCellHighlightStyle(rowId, `day-${i}`),
            }}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
            className={withCellSelectionClass(
              `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
              `day-${i}`
            )}
            {...cellClickProps(`day-${i}`)}
          >
            <input
              type="text"
              className={sharedInputStyle}
              defaultValue=""
              onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
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
  };

  const renderProjectGeneralRow = ({
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
    tableRow,
  }) => (
    <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
      <td
        {...cellMetadataProps('rowLabel')}
        className={withCellSelectionClass(
          `text-center border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
          'rowLabel'
        )}
        style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
        tabIndex={0}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
        onFocus={() =>
          handleCellActivate(rowId, 'rowLabel', {
            highlightRow: true,
            preserveSelection: true,
          })
        }
        onClick={(event) => handleRowClick(event, tableRow.index)}
      >
        {rowNumber}
      </td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'check')}
        style={getWidthStyle('check', getCellHighlightStyle(rowId, 'check'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'check')}
        {...cellClickProps('check')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'project')}
        style={getWidthStyle('project', getCellHighlightStyle(rowId, 'project'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'project')}
        {...cellClickProps('project')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'status')}
        style={getWidthStyle('status', getCellHighlightStyle(rowId, 'status'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'status')}
        {...cellClickProps('status')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb] px-2 font-extrabold text-[12px]', 'task')}
        style={getWidthStyle('task', { fontWeight: 800, paddingLeft: 8, ...getCellHighlightStyle(rowId, 'task') })}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'task')}
        {...cellClickProps('task')}
      >
        General
      </td>
      {showRecurring && (
        <td
          className={withCellSelectionClass('bg-[#f2e5eb]', 'recurring')}
          style={getWidthStyle('recurring', getCellHighlightStyle(rowId, 'recurring'))}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'recurring')}
          {...cellClickProps('recurring')}
        ></td>
      )}
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'estimate')}
        style={getWidthStyle('estimate', getCellHighlightStyle(rowId, 'estimate'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'estimate')}
        {...cellClickProps('estimate')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb] border border-[#ced3d0]', 'timeValue')}
        style={getWidthStyle('timeValue', {
          ...blackDividerStyle,
          ...getCellHighlightStyle(rowId, 'timeValue'),
          textAlign: 'right',
          paddingRight: 8,
        })}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'timeValue')}
        {...cellClickProps('timeValue')}
      ></td>
      {Array.from({ length: totalDays }).map((_, i) => (
        <td
          key={`${rowId}-gen-${i}`}
          style={{
            ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
            ...getCellHighlightStyle(rowId, `day-${i}`),
          }}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
          className={withCellSelectionClass(
            `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
            `day-${i}`
          )}
          {...cellClickProps(`day-${i}`)}
        >
          <input
            type="text"
            className={sharedInputStyle}
            defaultValue=""
            onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
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

  const renderProjectTaskRow = ({
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
  }) => {
    const dayEntries = Array.isArray(row.dayEntries) ? row.dayEntries : [];
    const isCustomEstimate = row.estimate === 'Custom';
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
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={withCellSelectionClass(
            `text-center align-middle border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
            'rowLabel'
          )}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
          tabIndex={0}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
          onFocus={() =>
            handleCellActivate(rowId, 'rowLabel', {
              highlightRow: true,
              preserveSelection: true,
            })
          }
          onClick={(event) => handleRowClick(event, tableRow.index)}
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass('border border-[#ced3d0] p-0 check-cell', 'check')}
          style={getWidthStyle('check', getCellHighlightStyle(rowId, 'check'))}
          {...cellClickProps('check')}
        >
          <div className="flex h-full w-full items-center justify-center">
            <input
              type="checkbox"
              className={checkboxInputClass}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, 'check')}
              onFocus={() => handleCellActivate(rowId, 'check')}
              onChange={ensureInteractionMarked}
            />
          </div>
        </td>
        <td
          style={getWidthStyle('project', getCellHighlightStyle(rowId, 'project'))}
          className={withCellSelectionClass('border border-[#ced3d0] p-0', 'project')}
          {...cellClickProps('project')}
        >
          <select
            className={`${sharedInputStyle} uppercase project-pill-select`}
            style={getProjectSelectStyle(row.projectSelection)}
            value={row.projectSelection ?? '-'}
            onChange={(event) => {
              const nextValue = event.target.value;
              commitRowUpdate({ projectSelection: nextValue }, { markInteraction: true });
            }}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'project')}
            onFocus={() => handleCellActivate(rowId, 'project')}
          >
            <option>-</option>
            <option>PROJECT A</option>
            <option>PROJECT B</option>
            <option>PROJECT C</option>
          </select>
        </td>
        <td
          style={getWidthStyle('status', getCellHighlightStyle(rowId, 'status'))}
          className={withCellSelectionClass('border border-[#ced3d0] p-0', 'status')}
          {...cellClickProps('status')}
        >
          <div className="status-pill-container">
            <select
              className="status-pill-select"
              style={getStatusColorStyle(row.status)}
              value={row.status ?? '-'}
              onChange={(event) => {
                const nextValue = event.target.value;
                commitRowUpdate({ status: nextValue }, { markInteraction: true });
              }}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, 'status')}
              onFocus={() => handleCellActivate(rowId, 'status')}
            >
              <StatusOptions />
            </select>
          </div>
        </td>
        <td
          style={getWidthStyle('task', getCellHighlightStyle(rowId, 'task'))}
          className={withCellSelectionClass('border border-[#ced3d0] p-0', 'task')}
          {...cellClickProps('task')}
        >
          <input
            type="text"
            className={sharedInputStyle}
            value={row.taskName ?? ''}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'task')}
            onFocus={() => handleCellActivate(rowId, 'task')}
            onChange={(event) => updateTaskName(event.target.value)}
            onPaste={(event) =>
              handleOverwritePaste(event, (text) => updateTaskName(text))
            }
          />
        </td>
        {showRecurring && (
          <td
            className={withCellSelectionClass('border border-[#ced3d0] p-0', 'recurring')}
            style={getWidthStyle('recurring', getCellHighlightStyle(rowId, 'recurring'))}
            {...cellClickProps('recurring')}
          >
            <div className="flex h-full w-full items-center justify-center">
              <input
                type="checkbox"
                className={checkboxInputClass}
                checked={row.recurring === 'Recurring'}
                onMouseDown={(event) => handleCellMouseDown(event, rowId, 'recurring')}
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
          className={withCellSelectionClass('border border-[#ced3d0] p-0', 'estimate')}
          {...cellClickProps('estimate')}
        >
          <select
            className={sharedInputStyle}
            value={row.estimate ?? '-'}
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
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'estimate')}
            onFocus={() => handleCellActivate(rowId, 'estimate')}
          >
            <EstimateOptions />
          </select>
        </td>
        <td
          className={withCellSelectionClass('border border-[#ced3d0] p-0', 'timeValue')}
          style={getWidthStyle('timeValue', {
            ...blackDividerStyle,
            ...getCellHighlightStyle(rowId, 'timeValue'),
            textAlign: 'right',
            paddingRight: 8,
          })}
          {...cellClickProps('timeValue')}
        >
          <input
            type="text"
            className={`${sharedInputStyle} text-right pr-2`}
            value={row.timeValue ?? '0.00'}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'timeValue')}
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
            }}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
            className={withCellSelectionClass(
              `${getWeekBorderClass(i, 'border border-[#ced3d0]')} p-0`,
              `day-${i}`
            )}
            {...cellClickProps(`day-${i}`)}
          >
            <input
              type="text"
              className={sharedInputStyle}
              value={dayEntries[i] ?? ''}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
              onFocus={() => handleCellActivate(rowId, `day-${i}`)}
              onChange={(event) => updateDayEntry(i, event.target.value)}
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

  const renderProjectUnscheduledRow = ({
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
    tableRow,
  }) => (
    <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
      <td
        {...cellMetadataProps('rowLabel')}
        className={withCellSelectionClass(
          `text-center border border-[#ced3d0]${isRowSelected ? ' selected-cell' : ''}`,
          'rowLabel'
        )}
        style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
        tabIndex={0}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
        onFocus={() =>
          handleCellActivate(rowId, 'rowLabel', {
            highlightRow: true,
            preserveSelection: true,
          })
        }
        onClick={(event) => handleRowClick(event, tableRow.index)}
      >
        {rowNumber}
      </td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'check')}
        style={getWidthStyle('check', getCellHighlightStyle(rowId, 'check'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'check')}
        {...cellClickProps('check')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'project')}
        style={getWidthStyle('project', getCellHighlightStyle(rowId, 'project'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'project')}
        {...cellClickProps('project')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'status')}
        style={getWidthStyle('status', getCellHighlightStyle(rowId, 'status'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'status')}
        {...cellClickProps('status')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb] px-2 font-extrabold text-[12px]', 'task')}
        style={getWidthStyle('task', { fontWeight: 800, paddingLeft: 8, ...getCellHighlightStyle(rowId, 'task') })}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'task')}
        {...cellClickProps('task')}
      >
        Unscheduled
      </td>
      {showRecurring && (
        <td
          className={withCellSelectionClass('bg-[#f2e5eb]', 'recurring')}
          style={getWidthStyle('recurring', getCellHighlightStyle(rowId, 'recurring'))}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'recurring')}
          {...cellClickProps('recurring')}
        ></td>
      )}
      <td
        className={withCellSelectionClass('bg-[#f2e5eb]', 'estimate')}
        style={getWidthStyle('estimate', getCellHighlightStyle(rowId, 'estimate'))}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'estimate')}
        {...cellClickProps('estimate')}
      ></td>
      <td
        className={withCellSelectionClass('bg-[#f2e5eb] border border-[#ced3d0]', 'timeValue')}
        style={getWidthStyle('timeValue', {
          ...blackDividerStyle,
          ...getCellHighlightStyle(rowId, 'timeValue'),
          textAlign: 'right',
          paddingRight: 8,
        })}
        onMouseDown={(event) => handleCellMouseDown(event, rowId, 'timeValue')}
        {...cellClickProps('timeValue')}
      ></td>
      {Array.from({ length: totalDays }).map((_, i) => (
        <td
          key={`${rowId}-uns-${i}`}
          style={{
            ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
            ...getCellHighlightStyle(rowId, `day-${i}`),
          }}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
          className={withCellSelectionClass(
            `${getWeekBorderClass(i, 'bg-white border border-[#ced3d0]')} p-0`,
            `day-${i}`
          )}
          {...cellClickProps(`day-${i}`)}
        >
          <input
            type="text"
            className={sharedInputStyle}
            defaultValue=""
            onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
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

  const renderInboxHeaderRow = ({
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
  }) => {
    const headerStyle = DARK_HEADER_STYLE;
    return (
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={withCellSelectionClass(
            `font-bold text-center border-0${isRowSelected ? ' selected-cell' : ''}`,
            'rowLabel'
          )}
          style={getWidthStyle('rowLabel', applyRowLabelStyle({
            ...headerStyle,
            ...getCellHighlightStyle(rowId, 'rowLabel'),
          }))}
          tabIndex={0}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
          onFocus={() =>
            handleCellActivate(rowId, 'rowLabel', {
              highlightRow: true,
              preserveSelection: true,
            })
          }
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass('font-bold px-2 border-0', 'header-fixed')}
          colSpan={fixedCols - 1}
          style={{
            ...blackDividerStyle,
            ...headerStyle,
            ...getCellHighlightStyle(rowId, 'header-fixed'),
            paddingLeft: 8,
            fontWeight: 800,
          }}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'header-fixed')}
          {...cellClickProps('header-fixed')}
        >
          Inbox
        </td>
        <td
          className={withCellSelectionClass('border-0', 'header-span')}
          colSpan={totalDays}
          style={{ ...headerStyle, ...getCellHighlightStyle(rowId, 'header-span') }}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'header-span')}
          {...cellClickProps('header-span')}
        ></td>
      </tr>
    );
  };

  const renderArchiveHeaderRow = ({
    rowId,
    rowNumber,
    isRowSelected,
    rowPropsLocal,
    cellMetadataProps,
    withCellSelectionClass,
    cellClickProps,
  }) => {
    const headerStyle = DARK_HEADER_STYLE;
    return (
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={withCellSelectionClass(
            `font-bold text-center border-0${isRowSelected ? ' selected-cell' : ''}`,
            'rowLabel'
          )}
          style={getWidthStyle('rowLabel', applyRowLabelStyle({
            ...headerStyle,
            ...getCellHighlightStyle(rowId, 'rowLabel'),
          }))}
          tabIndex={0}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
          onFocus={() =>
            handleCellActivate(rowId, 'rowLabel', {
              highlightRow: true,
              preserveSelection: true,
            })
          }
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass('font-bold px-2 border-0', 'header-fixed')}
          colSpan={fixedCols - 1}
          style={{
            ...blackDividerStyle,
            ...headerStyle,
            ...getCellHighlightStyle(rowId, 'header-fixed'),
            paddingLeft: 8,
            fontWeight: 800,
          }}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'header-fixed')}
          {...cellClickProps('header-fixed')}
        >
          Archive
        </td>
        <td
          className={withCellSelectionClass('border-0', 'header-span')}
          colSpan={totalDays}
          style={{ ...headerStyle, ...getCellHighlightStyle(rowId, 'header-span') }}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'header-span')}
          {...cellClickProps('header-span')}
        ></td>
      </tr>
    );
  };

  const renderArchiveRow = ({
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
  }) => {
    const topBorderClass =
      previousRow && (previousRow.type === 'archiveHeader' || previousRow.type === 'archiveRow')
        ? ' border-t-0'
        : '';
    return (
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={withCellSelectionClass(
            `text-center align-middle border border-[#ced3d0]${topBorderClass}${isRowSelected ? ' selected-cell' : ''}`,
            'rowLabel'
          )}
          style={getWidthStyle('rowLabel', applyRowLabelStyle({
            ...ARCHIVE_ROW_STYLE,
            ...getCellHighlightStyle(rowId, 'rowLabel'),
          }))}
          tabIndex={0}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
          onFocus={() =>
            handleCellActivate(rowId, 'rowLabel', {
              highlightRow: true,
              preserveSelection: true,
            })
          }
          onClick={(event) => handleRowClick(event, tableRow.index)}
        >
          {rowNumber}
        </td>
        {fixedColumnConfig.map(({ key, className }, colIdx) => {
          const cellContent = (() => {
            if (colIdx === 0) return row.archiveWeekLabel ?? '';
            if (key === 'task') return row.archiveLabel ?? '';
            if (key === 'estimate') return '0.00';
            if (key === 'timeValue') return 'of 0.00 - 0.00';
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
              ? { textAlign: 'right', fontWeight: 800 }
              : key === 'timeValue'
                ? { textAlign: 'left' }
                : {};
          return (
            <td
              key={`${rowId}-${key}`}
              className={withCellSelectionClass(
                `border border-[#ced3d0]${topBorderClass} ${className ?? ''} font-semibold px-2`,
                key
              )}
              style={getWidthStyle(key, {
                ...ARCHIVE_ROW_STYLE,
                ...(key === 'timeValue' ? blackDividerStyle : {}),
                ...getCellHighlightStyle(rowId, key),
                ...extraStyles,
                ...alignmentStyle,
              })}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, key)}
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
              `${getWeekBorderClass(i, 'border border-[#ced3d0]' + topBorderClass)} p-0`,
              `day-${i}`
            )}
            style={applyWeekBorderStyles(i, getWidthStyle(`day-${i}`, {
              backgroundColor: '#ffffff',
              ...getCellHighlightStyle(rowId, `day-${i}`),
            }))}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
            {...cellClickProps(`day-${i}`)}
          ></td>
        ))}
      </tr>
    );
  };

  const renderInboxItemRow = ({
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
  }) => {
    const topBorderClass = previousRow && previousRow.type === 'inboxHeader' ? ' border-t-0' : '';
    const dayEntries = Array.isArray(row.dayEntries) ? row.dayEntries : [];
    const isCustomEstimate = row.estimate === 'Custom';
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
      <tr {...rowPropsLocal} className={`h-[${ROW_H}px]${isRowSelected ? ' selected-row' : ''}`}>
        <td
          {...cellMetadataProps('rowLabel')}
          className={withCellSelectionClass(
            `text-center align-middle border border-[#ced3d0]${topBorderClass} bg-white${
              isRowSelected ? ' selected-cell' : ''
            }`,
            'rowLabel'
          )}
          style={getWidthStyle('rowLabel', applyRowLabelStyle(getCellHighlightStyle(rowId, 'rowLabel')))}
          tabIndex={0}
          onMouseDown={(event) => handleCellMouseDown(event, rowId, 'rowLabel', { highlightRow: true })}
          onFocus={() =>
            handleCellActivate(rowId, 'rowLabel', {
              highlightRow: true,
              preserveSelection: true,
            })
          }
          onClick={(event) => handleRowClick(event, tableRow.index)}
        >
          {rowNumber}
        </td>
        <td
          className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0 check-cell`, 'check')}
          style={getWidthStyle('check', getCellHighlightStyle(rowId, 'check'))}
          {...cellClickProps('check')}
        >
          <div className="flex h-full w-full items-center justify-center">
            <input
              type="checkbox"
              className={checkboxInputClass}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, 'check')}
              onFocus={() => handleCellActivate(rowId, 'check')}
              onChange={ensureInteractionMarked}
            />
          </div>
        </td>
        <td
          style={getWidthStyle('project', getCellHighlightStyle(rowId, 'project'))}
          className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'project')}
          {...cellClickProps('project')}
        >
          <select
            className={`${sharedInputStyle} uppercase project-pill-select`}
            style={getProjectSelectStyle(row.projectSelection)}
            value={row.projectSelection ?? '-'}
            onChange={(event) => {
              const nextValue = event.target.value;
              commitRowUpdate({ projectSelection: nextValue }, { markInteraction: true });
            }}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'project')}
            onFocus={() => handleCellActivate(rowId, 'project')}
          >
            <option>-</option>
            <option>PROJECT A</option>
            <option>PROJECT B</option>
            <option>PROJECT C</option>
          </select>
        </td>
        <td
          style={getWidthStyle('status', getCellHighlightStyle(rowId, 'status'))}
          className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'status')}
          {...cellClickProps('status')}
        >
          <div className="status-pill-container">
            <select
              className="status-pill-select"
              style={getStatusColorStyle(row.status)}
              value={row.status ?? '-'}
              onChange={(event) => {
                const nextValue = event.target.value;
                commitRowUpdate({ status: nextValue }, { markInteraction: true });
              }}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, 'status')}
              onFocus={() => handleCellActivate(rowId, 'status')}
            >
              <StatusOptions />
            </select>
          </div>
        </td>
        <td
          style={getWidthStyle('task', getCellHighlightStyle(rowId, 'task'))}
          className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'task')}
          {...cellClickProps('task')}
        >
          <input
            type="text"
            className={sharedInputStyle}
            value={row.taskName ?? ''}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'task')}
            onFocus={() => handleCellActivate(rowId, 'task')}
            onChange={(event) => updateTaskName(event.target.value)}
            onPaste={(event) =>
              handleOverwritePaste(event, (text) => updateTaskName(text))
            }
          />
        </td>
        {showRecurring && (
          <td
            className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'recurring')}
            style={getWidthStyle('recurring', getCellHighlightStyle(rowId, 'recurring'))}
            {...cellClickProps('recurring')}
          >
            <div className="flex h-full w-full items-center justify-center">
              <input
                type="checkbox"
                className={checkboxInputClass}
                checked={row.recurring === 'Recurring'}
                onMouseDown={(event) => handleCellMouseDown(event, rowId, 'recurring')}
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
          className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'estimate')}
          {...cellClickProps('estimate')}
        >
          <select
            className={sharedInputStyle}
            value={row.estimate ?? '-'}
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
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'estimate')}
            onFocus={() => handleCellActivate(rowId, 'estimate')}
          >
            <EstimateOptions />
          </select>
        </td>
        <td
          className={withCellSelectionClass(`border border-[#ced3d0]${topBorderClass} p-0`, 'timeValue')}
          style={getWidthStyle('timeValue', {
            ...blackDividerStyle,
            ...getCellHighlightStyle(rowId, 'timeValue'),
            textAlign: 'right',
            paddingRight: 8,
          })}
          {...cellClickProps('timeValue')}
        >
          <input
            type="text"
            className={`${sharedInputStyle} text-right pr-2`}
            value={row.timeValue ?? '0.00'}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, 'timeValue')}
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
            key={`${rowId}-${i}`}
            style={{
              ...applyWeekBorderStyles(i, getWidthStyle(`day-${i}`)),
              ...getCellHighlightStyle(rowId, `day-${i}`),
            }}
            onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
            className={withCellSelectionClass(
              `${getWeekBorderClass(i, 'border border-[#ced3d0]' + topBorderClass)} p-0`,
              `day-${i}`
            )}
            {...cellClickProps(`day-${i}`)}
          >
            <input
              type="text"
              className={sharedInputStyle}
              value={dayEntries[i] ?? ''}
              onMouseDown={(event) => handleCellMouseDown(event, rowId, `day-${i}`)}
              onFocus={() => handleCellActivate(rowId, `day-${i}`)}
              onChange={(event) => updateDayEntry(i, event.target.value)}
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

  return {
    projectHeader: renderProjectHeaderRow,
    projectGeneral: renderProjectGeneralRow,
    projectTask: renderProjectTaskRow,
    projectUnscheduled: renderProjectUnscheduledRow,
    inboxHeader: renderInboxHeaderRow,
    archiveHeader: renderArchiveHeaderRow,
    archiveRow: renderArchiveRow,
    inboxItem: renderInboxItemRow,
  };
}
