import { useMemo } from 'react';

const createStyle = (backgroundColor, color) => ({ backgroundColor, color });

export default function useTimelineRows({
  dates,
  monthSpans,
  weeksCount,
  showMaxMinRows,
  totalDays,
  columnTotals,
  fixedColumnConfig,
  getWidthStyle,
  applyWeekBorderStyles,
  getWeekBorderClass,
  blackDividerStyle,
  formatTotalValue,
}) {
  const rows = useMemo(() => {
    const fixedTimelineStyle = createStyle('#000000', '#ffffff');
    const timelineHeaderStyle = createStyle('#ffffff', '#000000');
    const weekdayCellStyle = createStyle('#efefef', '#000000');
    const weekendCellStyle = createStyle('#d9d9d9', '#000000');

    const weekBoundaryClass = (index, baseClass = 'border border-[#ced3d0]') =>
      getWeekBorderClass(index, baseClass);

    const isMonthTransitionAfter = (index) => {
      const current = dates[index];
      const next = dates[index + 1];
      if (!current || !next) return false;
      return (
        current.getMonth() !== next.getMonth() ||
        current.getFullYear() !== next.getFullYear()
      );
    };

    const isMonthTransitionBefore = (index) =>
      index === 0 ? false : isMonthTransitionAfter(index - 1);

    const fixedHeaderCellStyle = createStyle('#000000', '#ffffff');

    let rowCounter = 1;

    const monthsRow = {
      id: 'months',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: { ...fixedTimelineStyle, ...blackDividerStyle },
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      cells: monthSpans.map((m, idx) => ({
        key: `month-${idx}`,
        colSpan: m.span,
        content: m.label,
        style: timelineHeaderStyle,
        className: `text-center font-semibold border border-black ${
          idx < monthSpans.length - 1 ? 'border-r-2 border-black' : ''
        }`,
      })),
    };

    const weeksRow = {
      id: 'weeks',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: { ...fixedTimelineStyle, ...blackDividerStyle },
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      cells: Array.from({ length: weeksCount }).map((_, w) => ({
        key: `week-${w}`,
        colSpan: 7,
        content: `Week ${w + 1}`,
        style: timelineHeaderStyle,
        className: `text-center font-semibold border border-black ${
          w < weeksCount - 1 ? 'border-r-2 border-black' : ''
        }`,
      })),
    };

    const datesRow = {
      id: 'dates',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: null,
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      fixedCells: fixedColumnConfig.map(({ key, label, width, className }) => ({
        key: `dates-fixed-${key}`,
        columnKey: key,
        content: label,
        className: `border border-[#ced3d0] ${className ?? ''}`,
        style: {
          width,
          ...fixedHeaderCellStyle,
          ...(key === 'timeValue' ? blackDividerStyle : {}),
        },
      })),
      cells: dates.map((d, i) => ({
        key: `date-${i}`,
        columnKey: `day-${i}`,
        content: d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '--',
        style: applyWeekBorderStyles(i, { ...timelineHeaderStyle }),
        className: `${weekBoundaryClass(i)} text-center text-black`,
      })),
    };

    const weekdaysRow = {
      id: 'weekdays',
      rowLabelStyle: fixedTimelineStyle,
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0] text-white',
      fixedCellStyle: { ...fixedTimelineStyle, ...blackDividerStyle },
      fixedCellClassName: 'border-0 text-white',
      rowLabelContent: String(rowCounter++),
      cells: dates.map((d, i) => ({
        key: `weekday-${i}`,
        columnKey: `day-${i}`,
        content: d ? d.toLocaleDateString('en-GB', { weekday: 'short' }).charAt(0) : '',
        style: (() => {
          const baseStyle = !d
            ? timelineHeaderStyle
            : [0, 6].includes(d.getDay())
            ? weekendCellStyle
            : weekdayCellStyle;
          const leftBorderIsBlack = isMonthTransitionBefore(i) || (i % 7 === 0 && i !== 0);
          const style = {
            ...baseStyle,
            borderTop: '1px solid #000000',
            borderBottom: '1px solid #000000',
            borderLeft: leftBorderIsBlack ? '2px solid #000000' : '1px solid #ced3d0',
            borderRight: '1px solid #ced3d0',
          };
          if (i && ((i + 1) % 7 === 0 || isMonthTransitionAfter(i))) {
            style.borderRight = '2px solid #000000';
          }
          return style;
        })(),
        className: 'text-center text-black font-semibold',
      })),
    };

    const createBufferRow = (suffix, fillColor, options = {}) => {
      return {
        id: `buffer-${suffix}`,
        rowLabelStyle: options.rowLabelStyle ?? fixedTimelineStyle,
        rowLabelClassName:
          options.rowLabelClassName ?? 'text-center font-semibold border-0 text-white',
        fixedCellStyle:
          options.fixedCellStyle ?? { ...fixedTimelineStyle, ...blackDividerStyle },
        fixedCellClassName: options.fixedCellClassName ?? 'border-0 text-white',
        rowLabelContent: String(rowCounter++),
        cells: dates.map((_, i) => {
          const style = applyWeekBorderStyles(i, {
            backgroundColor: fillColor,
            color: '#000000',
          });
          if (style.borderLeft === '1px solid #ced3d0') {
            style.borderLeft = '1px solid transparent';
          }
          if (style.borderRight === '1px solid #ced3d0') {
            style.borderRight = '1px solid transparent';
          }
          style.borderTop = '1px solid transparent';
          style.borderBottom = '1px solid transparent';
          return {
            key: `buffer-${suffix}-${i}`,
            columnKey: `day-${i}`,
            content: '',
            style,
            className: '',
          };
        }),
      };
    };

    const rows = [monthsRow, weeksRow, datesRow, weekdaysRow];
    if (showMaxMinRows) {
      rows.push(createBufferRow(1, '#ead1dc'));
      rows.push(createBufferRow(2, '#f2e5eb'));
    }

    const totalsRow = {
      id: 'totals',
      rowLabelStyle: { backgroundColor: '#ead1dc', color: '#000000' },
      rowLabelClassName: 'text-center font-semibold border border-[#ced3d0]',
      fixedCellStyle: { backgroundColor: '#ead1dc', color: '#000000' },
      fixedCellClassName: 'border border-[#ced3d0] font-semibold px-2 text-right',
      rowLabelContent: String(rowCounter++),
      fixedCells: fixedColumnConfig.map(({ key, width, className }) => ({
        key: `total-fixed-${key}`,
        columnKey: key,
        content: '',
        className: `border border-[#ced3d0] font-semibold px-2 text-right ${className ?? ''}`,
        style: {
          width,
          backgroundColor: '#ead1dc',
          color: '#000000',
          ...(key === 'timeValue' ? blackDividerStyle : {}),
        },
      })),
      cells: dates.map((_, i) => ({
        key: `total-day-${i}`,
        columnKey: `day-${i}`,
        content: formatTotalValue(columnTotals[`day-${i}`]),
        style: applyWeekBorderStyles(i, {
          backgroundColor: '#ead1dc',
          color: '#000000',
          fontWeight: 600,
        }),
        className: getWeekBorderClass(i, 'border border-[#ced3d0] text-center font-semibold'),
      })),
    };

    rows.push(totalsRow);
    return rows;
  }, [
    dates,
    monthSpans,
    weeksCount,
    showMaxMinRows,
    totalDays,
    columnTotals,
    fixedColumnConfig,
    getWidthStyle,
    applyWeekBorderStyles,
    getWeekBorderClass,
    blackDividerStyle,
    formatTotalValue,
  ]);

  return { timelineRows: rows };
}
