import React from 'react';
import {
  DragHandleCell,
  TextInputCell,
  EstimateSelectCell,
  TimeValueCell,
} from './TableCells';
import { PLAN_TABLE_COLS, formatMinutesToHHmm } from '../../utils/staging/planTableHelpers';
import { SECTION_CONFIG, getSectionGhost } from '../../utils/staging/sectionConfig';

/**
 * Convert HSL to RGB (all values 0–255).
 */
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Return the prompt-row background: color-mix(in srgb, goalColor 12%, white).
 * Keeps the row in the same hue family as the header but very pale.
 */
function getPromptBg(color) {
  if (!color) return '#FAF9F7';

  // hsl(h, s%, l%) — the format pickProjectColour produces
  const hslMatch = color.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  if (hslMatch) {
    const [r, g, b] = hslToRgb(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]));
    return `rgb(${Math.round(r * 0.12 + 255 * 0.88)},${Math.round(g * 0.12 + 255 * 0.88)},${Math.round(b * 0.12 + 255 * 0.88)})`;
  }

  // Fallback for hex colors from the custom color picker
  const hex = color.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgb(${Math.round(r * 0.12 + 255 * 0.88)},${Math.round(g * 0.12 + 255 * 0.88)},${Math.round(b * 0.12 + 255 * 0.88)})`;
  }

  return '#FAF9F7';
}

// ─── Row action buttons (shells — not yet wired to commands) ──────────────────

function RowBtn({ title, onClick, children }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={title}
        className="inline-flex cursor-pointer items-center border-none bg-transparent p-0 text-slate-900 hover:text-emerald-900"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (onClick) onClick(e);
        }}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100"
      >
        {title}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </span>
    </span>
  );
}

function BtnSep() {
  return <span className="inline-block h-3.5 w-px bg-slate-400" />;
}

const AddRowIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/>
  </svg>
);

const AddPairIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="15" y1="12" x2="15" y2="18"/><line x1="12" y1="15" x2="18" y2="15"/>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

const SendToActionsIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 8v8"/><path d="m8 12 4 4 4-4"/>
  </svg>
);

/**
 * Per-row inline action buttons, per the goals_table.html mockup:
 *   - Outcomes prompt:   send to actions · add pair · add row
 *   - Actions prompt:    add pair · add row
 *   - Outcomes response: send to actions · add row
 *   - all other prompt/response rows: add row
 */
function RowShellButtons({ rowType, sectionType, onAddRow, onAddPair, onSendToActions }) {
  const send = sectionType === 'Outcomes';
  const pair = rowType === 'prompt' && (sectionType === 'Outcomes' || sectionType === 'Actions');

  return (
    <span className="flex items-center gap-1.5 opacity-0 pointer-events-none transition-opacity duration-100 group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto">
      {send && (
        <>
          <RowBtn title="Send to Actions" onClick={onSendToActions}>
            {SendToActionsIcon}
          </RowBtn>
          <BtnSep />
        </>
      )}
      {pair && (
        <>
          <RowBtn title="Add pair below" onClick={onAddPair}>
            {AddPairIcon}
          </RowBtn>
          <BtnSep />
        </>
      )}
      <RowBtn title="Add row below" onClick={onAddRow}>{AddRowIcon}</RowBtn>
    </span>
  );
}

/**
 * Unified table row component that handles all row types:
 * - header: Section header row (grey, spans all columns)
 * - prompt: Question/prompt row (medium grey)
 * - response: Answer/data row (light grey)
 * - data: Generic data row (white)
 */
export default function TableRow({
  item,
  rowValues,
  rowIdx,
  rowType,
  sectionType,
  // Selection state
  isCellSelected,
  isRowSelected,
  isDropTarget,
  isDragged,
  // Handlers
  onCellChange,
  onEstimateChange,
  onCellMouseDown,
  onCellMouseEnter,
  onHandleClick,
  onInputFocus,
  onEnterKeyAddRow,
  onContextMenu,
  isFirstOfType,
  // Row action button handlers
  onAddRowBelow,
  onAddPairBelow,
  onSendToActions,
  // Drag handlers
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  // Styling
  textSizeScale,
  // Selection context for context menu
  selectedCells,
  selectedRows,
  // Outcome totaling
  outcomeTotals,
  outcomeSectionTotal,
}) {
  // Actions rows can show their time cells via the per-goal showActionTimes
  // flag (undefined = hidden, default off). Schedule rows always show times.
  const showActionTimes = item.showActionTimes === true;
  const hasTimeElements = (sectionType === 'Actions' && showActionTimes) || sectionType === 'Schedule';
  const isSchedulePrompt = rowType === 'prompt' && sectionType === 'Schedule';

  // L68 swatch from the same palette family as the goal's header color.
  const promptBg = getPromptBg(item.color);

  // Common row props for drag and drop
  const rowProps = {
    draggable: true,
    className: `group/row${isRowSelected ? ' selected-row' : ''}`,
    onDragStart: (e) => onDragStart(e, item.id, rowIdx),
    onDragOver: (e) => onDragOver(e, item.id, rowIdx),
    onDrop: (e) => onDrop(e, item.id, rowIdx),
    onDragEnd,
    onContextMenu: onContextMenu ? (e) =>
      onContextMenu(e, {
        itemId: item.id,
        rowIdx,
        sectionType,
        rowType,
        showOutcomeTotals: item.showOutcomeTotals || false,
        isFirstOfType,
        selectedCells,
        selectedRows,
      }) : undefined,
    style: {
      opacity: isDragged ? 0.5 : 1,
      cursor: 'grab',
    },
  };

  // Helper to create data attributes
  const dataAttrs = (col) => ({
    'data-plan-item': item.id,
    'data-plan-row': rowIdx,
    'data-plan-col': col,
  });

  // Helper for cell mouse handlers
  const cellMouseDown = (e, col) => onCellMouseDown(e, item.id, rowIdx, col, PLAN_TABLE_COLS);
  const cellMouseEnter = (col) => onCellMouseEnter(item.id, rowIdx, col, PLAN_TABLE_COLS);

  // HEADER ROW — dark chapter header matching design spec
  if (rowType === 'header') {
    const showSectionTotal = false;

    const SECTION_NUMBERS = { Reasons: '01', Outcomes: '02', Actions: '03', Schedule: '04' };
    const sectionNum = SECTION_NUMBERS[sectionType] ?? '';
    const sectionLabel = sectionType?.toUpperCase() ?? '';
    const questionText = rowValues[0] || '';

    return (
      <tr key={`${item.id}-row-${rowIdx}`} style={{ opacity: isDragged ? 0.5 : 1 }}>
        {/* Section number */}
        <td
          style={{
            width: 36, minWidth: 36, height: 44,
            background: '#24252B',
            borderRight: '1px solid rgba(255,255,255,.06)',
            verticalAlign: 'middle',
            textAlign: 'center',
            padding: 0,
          }}
        >
          <span style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 22, fontWeight: 700,
            color: 'rgba(255,255,255,.18)',
            lineHeight: 1,
          }}>{sectionNum}</span>
        </td>
        {/* Section label + question */}
        <td
          colSpan={showSectionTotal ? PLAN_TABLE_COLS - 1 : PLAN_TABLE_COLS}
          style={{
            height: 44,
            background: '#24252B',
            padding: '10px 14px 0',
            verticalAlign: 'top',
            borderRight: isDropTarget ? '2px solid #fff' : undefined,
          }}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8.5,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.55)',
              lineHeight: 1,
            }}>{sectionLabel}</span>
            <span style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'rgba(255,255,255,.95)',
              lineHeight: 1.15,
            }}>{questionText}</span>
          </div>
        </td>
        {showSectionTotal && (
          <td
            style={{
              height: 44,
              background: '#24252B',
              width: 70, minWidth: 60,
              textAlign: 'right',
              paddingRight: 8,
              fontFamily: "'Mulish', sans-serif",
              fontSize: `${Math.round(13 * textSizeScale)}px`,
              color: 'rgba(255,255,255,.7)',
              verticalAlign: 'middle',
            }}
          >
            {formatMinutesToHHmm(outcomeSectionTotal)}
          </td>
        )}
      </tr>
    );
  }

  // PROMPT ROW - Schedule section (has time elements)
  if (isSchedulePrompt) {
    const estimateValue = rowValues[4] || '-';
    const isCustomEstimate = estimateValue === 'Custom';
    const displayedTimeValue = rowValues[5] || '0.00';

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="prompt"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <TextInputCell
          value={rowValues[0]}
          onChange={(val) => onCellChange(item.id, rowIdx, 0, val)}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 0)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          promptBg={promptBg}
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="80px"
          dataAttributes={dataAttrs(0)}
          trailing={(
            <RowShellButtons
              rowType="prompt"
              sectionType={sectionType}
              onAddRow={() => onAddRowBelow?.(item.id, rowIdx, 'prompt', sectionType)}
              onAddPair={() => onAddPairBelow?.(item.id, rowIdx)}
              onSendToActions={() => onSendToActions?.(item.id, rowIdx)}
            />
          )}
        />
        <TextInputCell
          value={rowValues[2]}
          onChange={(val) => onCellChange(item.id, rowIdx, 2, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'prompt', sectionType)}
          placeholder={getSectionGhost('Schedule')}
          onMouseDown={(e) => cellMouseDown(e, 2)}
          onMouseEnter={() => cellMouseEnter(2)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 2)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          promptBg={promptBg}
          textSizeScale={textSizeScale}
          colSpan={3}
          minWidth={`${Math.round(380 * textSizeScale)}px`}
          dataAttributes={dataAttrs(2)}
        />
        <EstimateSelectCell
          value={estimateValue}
          onChange={(val) => onEstimateChange(item.id, rowIdx, val)}
          onMouseDown={(e) => cellMouseDown(e, 4)}
          onMouseEnter={() => cellMouseEnter(4)}
          isSelected={isCellSelected(item.id, rowIdx, 4)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          promptBg={promptBg}
          textSizeScale={textSizeScale}
          dataAttributes={dataAttrs(4)}
        />
        <TimeValueCell
          value={displayedTimeValue}
          onChange={(val) => onCellChange(item.id, rowIdx, 5, val)}
          onMouseDown={(e) => cellMouseDown(e, 5)}
          onMouseEnter={() => cellMouseEnter(5)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 5)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          promptBg={promptBg}
          textSizeScale={textSizeScale}
          readOnly={!isCustomEstimate}
          dataAttributes={dataAttrs(5)}
        />
      </tr>
    );
  }

  // PROMPT ROW - Regular (no time elements, but may show totals for Actions section)
  if (rowType === 'prompt') {
    const showOutcomeTotals = item.showOutcomeTotals || false;
    const isActionsPrompt = sectionType === 'Actions';
    // outcomeTotals is now keyed by row index
    const outcomeTotal = isActionsPrompt && outcomeTotals ? outcomeTotals.get(rowIdx) || 0 : 0;
    const showTotal = isActionsPrompt && showOutcomeTotals;

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="prompt"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        <TextInputCell
          value={rowValues[0]}
          onChange={(val) => onCellChange(item.id, rowIdx, 0, val)}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 0)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          promptBg={promptBg}
          textSizeScale={textSizeScale}
          width="120px"
          minWidth="80px"
          dataAttributes={dataAttrs(0)}
          trailing={(
            <RowShellButtons
              rowType="prompt"
              sectionType={sectionType}
              onAddRow={() => onAddRowBelow?.(item.id, rowIdx, 'prompt', sectionType)}
              onAddPair={() => onAddPairBelow?.(item.id, rowIdx)}
              onSendToActions={() => onSendToActions?.(item.id, rowIdx)}
            />
          )}
        />
        <TextInputCell
          value={rowValues[1]}
          onChange={(val) => onCellChange(item.id, rowIdx, 1, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'prompt', sectionType)}
          placeholder={getSectionGhost(sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 1)}
          onMouseEnter={() => cellMouseEnter(1)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 1)}
          isDropTarget={isDropTarget}
          rowType="prompt"
          promptBg={promptBg}
          textSizeScale={textSizeScale}
          colSpan={showTotal ? PLAN_TABLE_COLS - 2 : PLAN_TABLE_COLS - 1}
          minWidth={`${Math.round(380 * textSizeScale)}px`}
          dataAttributes={dataAttrs(1)}
        />
        {showTotal && (
          <td
            style={{
              backgroundColor: promptBg,
              width: 70, minWidth: 60,
              height: 24,
              borderBottom: '1px solid #DAD8C8',
              borderRight: '1px solid #DAD8C8',
              textAlign: 'right',
              paddingRight: 8,
              fontFamily: "'Mulish', sans-serif",
              fontSize: `${Math.round(12.5 * textSizeScale)}px`,
              fontWeight: 600,
              color: '#1F1F1F',
              verticalAlign: 'middle',
            }}
          >
            {formatMinutesToHHmm(outcomeTotal)}
          </td>
        )}
      </tr>
    );
  }

  // RESPONSE ROW - with time elements (Actions or Schedule section)
  if (rowType === 'response' && hasTimeElements) {
    const estimateValue = rowValues[4] || '-';
    const displayedTimeValue = rowValues[5] || '0.00';

    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="response"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        {/* Button cell */}
        <td
          className="group/cell"
          colSpan={2}
          style={{
            width: 123, minWidth: 80,
            height: 24,
            backgroundColor: isDropTarget ? '#fff5fc' : '#ffffff',
            borderBottom: '1px solid #DAD8C8',
            borderRight: '1px solid #DAD8C8',
            borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
            padding: '0 4px',
            verticalAlign: 'middle',
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div onMouseDown={(e) => e.stopPropagation()}>
              <RowShellButtons
                rowType="response"
                sectionType={sectionType}
                onAddRow={() => onAddRowBelow?.(item.id, rowIdx, 'response', sectionType)}
                onSendToActions={() => onSendToActions?.(item.id, rowIdx)}
              />
            </div>
          </div>
        </td>
        <TextInputCell
          value={rowValues[2]}
          onChange={(val) => onCellChange(item.id, rowIdx, 2, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'response', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 2)}
          onMouseEnter={() => cellMouseEnter(2)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 2)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          colSpan={2}
          minWidth={`${Math.round(380 * textSizeScale)}px`}
          dataAttributes={dataAttrs(2)}
          placeholder={getSectionGhost(sectionType, 'response')}
        />
        <EstimateSelectCell
          value={estimateValue}
          onChange={(val) => onEstimateChange(item.id, rowIdx, val)}
          onMouseDown={(e) => cellMouseDown(e, 4)}
          onMouseEnter={() => cellMouseEnter(4)}
          isSelected={isCellSelected(item.id, rowIdx, 4)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          dataAttributes={dataAttrs(4)}
        />
        <TimeValueCell
          value={displayedTimeValue}
          onChange={(val) => onCellChange(item.id, rowIdx, 5, val)}
          onMouseDown={(e) => cellMouseDown(e, 5)}
          onMouseEnter={() => cellMouseEnter(5)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 5)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          readOnly={false}
          dataAttributes={dataAttrs(5)}
        />
      </tr>
    );
  }

  // RESPONSE ROW - without time elements
  if (rowType === 'response') {
    return (
      <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
        <DragHandleCell
          isRowSelected={isRowSelected}
          isDropTarget={isDropTarget}
          rowType="response"
          onClick={(e) => onHandleClick(e, item.id, rowIdx)}
        />
        {/* Button cell */}
        <td
          className="group/cell"
          colSpan={2}
          style={{
            width: 123, minWidth: 80,
            height: 24,
            backgroundColor: isDropTarget ? '#fff5fc' : '#ffffff',
            borderBottom: '1px solid #DAD8C8',
            borderRight: '1px solid #DAD8C8',
            borderTop: isDropTarget ? '2px solid #1A1A1A' : 'none',
            padding: '0 4px',
            verticalAlign: 'middle',
            boxSizing: 'border-box',
          }}
          onMouseDown={(e) => cellMouseDown(e, 0)}
          onMouseEnter={() => cellMouseEnter(0)}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div onMouseDown={(e) => e.stopPropagation()}>
              <RowShellButtons
                rowType="response"
                sectionType={sectionType}
                onAddRow={() => onAddRowBelow?.(item.id, rowIdx, 'response', sectionType)}
                onSendToActions={() => onSendToActions?.(item.id, rowIdx)}
              />
            </div>
          </div>
        </td>
        <TextInputCell
          value={rowValues[2]}
          onChange={(val) => onCellChange(item.id, rowIdx, 2, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, 'response', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, 2)}
          onMouseEnter={() => cellMouseEnter(2)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, 2)}
          isDropTarget={isDropTarget}
          rowType="response"
          textSizeScale={textSizeScale}
          colSpan={PLAN_TABLE_COLS - 2}
          minWidth={`${Math.round(380 * textSizeScale)}px`}
          dataAttributes={dataAttrs(2)}
          placeholder={getSectionGhost(sectionType, 'response')}
        />
      </tr>
    );
  }

  // DATA ROW - generic row with all cells editable (fallback)
  return (
    <tr key={`${item.id}-row-${rowIdx}`} {...rowProps}>
      <DragHandleCell
        isRowSelected={isRowSelected}
        isDropTarget={isDropTarget}
        rowType="data"
        onClick={(e) => onHandleClick(e, item.id, rowIdx)}
      />
      {rowValues.map((cellValue, cellIdx) => (
        <TextInputCell
          key={`${item.id}-row-${rowIdx}-cell-${cellIdx}`}
          value={cellValue}
          onChange={(val) => onCellChange(item.id, rowIdx, cellIdx, val)}
          onKeyDown={(e) => onEnterKeyAddRow(e, item.id, rowIdx, rowValues.__rowType || 'data', sectionType)}
          onMouseDown={(e) => cellMouseDown(e, cellIdx)}
          onMouseEnter={() => cellMouseEnter(cellIdx)}
          onFocus={onInputFocus}
          isSelected={isCellSelected(item.id, rowIdx, cellIdx)}
          isDropTarget={isDropTarget}
          rowType="data"
          textSizeScale={textSizeScale}
          dataAttributes={dataAttrs(cellIdx)}
        />
      ))}
    </tr>
  );
}
