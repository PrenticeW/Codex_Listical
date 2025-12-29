/**
 * Row Type Checking Utilities
 *
 * Provides helper functions to identify different types of rows in the planner.
 * This centralizes all row type checking logic and makes the codebase more maintainable.
 */

/**
 * Check if row is a timeline header row (month, week, day, or day-of-week)
 */
export const isTimelineRow = (row: any): boolean => {
  return !!(
    row._isMonthRow ||
    row._isWeekRow ||
    row._isDayRow ||
    row._isDayOfWeekRow
  );
};

/**
 * Check if row is a metrics row (daily min or max)
 */
export const isMetricsRow = (row: any): boolean => {
  return !!(row._isDailyMinRow || row._isDailyMaxRow);
};

/**
 * Check if row is a section divider (Inbox or Archive divider - legacy)
 */
export const isSectionDivider = (row: any): boolean => {
  return !!(row._isInboxRow || row._isArchiveRow);
};

/**
 * Check if row is a special row (timeline, filter, metrics, divider, or archive)
 */
export const isSpecialRow = (row: any): boolean => {
  return !!(
    row._isFilterRow ||
    row._isInboxRow ||
    row._isArchiveRow ||
    row._rowType ||
    isTimelineRow(row) ||
    isMetricsRow(row) ||
    isAnyArchiveRow(row)
  );
};

/**
 * Check if row is a project structure row (header, general, or unscheduled)
 */
export const isProjectStructureRow = (row: any): boolean => {
  return (
    row._rowType === 'projectHeader' ||
    row._rowType === 'projectGeneral' ||
    row._rowType === 'projectUnscheduled'
  );
};

/**
 * Check if row is a project header row
 */
export const isProjectHeader = (row: any): boolean => {
  return row._rowType === 'projectHeader';
};

/**
 * Check if row is a project general section row
 */
export const isProjectGeneral = (row: any): boolean => {
  return row._rowType === 'projectGeneral';
};

/**
 * Check if row is a project unscheduled section row
 */
export const isProjectUnscheduled = (row: any): boolean => {
  return row._rowType === 'projectUnscheduled';
};

/**
 * Check if row is a project task row
 */
export const isProjectTask = (row: any): boolean => {
  return row._rowType === 'projectTask';
};

/**
 * Check if row is an archive header row
 */
export const isArchiveHeader = (row: any): boolean => {
  return row._rowType === 'archiveHeader';
};

/**
 * Check if row is an archive week row
 */
export const isArchiveWeekRow = (row: any): boolean => {
  return row._rowType === 'archiveRow';
};

/**
 * Check if row is an archived project header
 */
export const isArchivedProjectHeader = (row: any): boolean => {
  return row._rowType === 'archivedProjectHeader';
};

/**
 * Check if row is an archived project general section
 */
export const isArchivedProjectGeneral = (row: any): boolean => {
  return row._rowType === 'archivedProjectGeneral';
};

/**
 * Check if row is an archived project unscheduled section
 */
export const isArchivedProjectUnscheduled = (row: any): boolean => {
  return row._rowType === 'archivedProjectUnscheduled';
};

/**
 * Check if row is any archive-related row
 */
export const isAnyArchiveRow = (row: any): boolean => {
  return (
    isArchiveHeader(row) ||
    isArchiveWeekRow(row) ||
    isArchivedProjectHeader(row) ||
    isArchivedProjectGeneral(row) ||
    isArchivedProjectUnscheduled(row)
  );
};

/**
 * Check if row is an archived project structure row
 */
export const isArchivedProjectStructure = (row: any): boolean => {
  return (
    isArchivedProjectHeader(row) ||
    isArchivedProjectGeneral(row) ||
    isArchivedProjectUnscheduled(row)
  );
};

/**
 * Check if row is editable (not a special row or project structure row)
 */
export const isEditableRow = (row: any): boolean => {
  return !isSpecialRow(row) && !isProjectStructureRow(row);
};

/**
 * Check if row should be excluded from filtering
 * (timeline rows, filter row, inbox/archive dividers, project structure rows, archive rows)
 */
export const shouldBypassFilters = (row: any): boolean => {
  return (
    isTimelineRow(row) ||
    row._isFilterRow ||
    isSectionDivider(row) ||
    isProjectStructureRow(row) ||
    isAnyArchiveRow(row) ||
    isArchivedProjectStructure(row)
  );
};

/**
 * Check if row can be dragged and reordered
 * Archive rows and archived project structure rows cannot be dragged
 */
export const isDraggableRow = (row: any): boolean => {
  return !isSpecialRow(row) && !isProjectStructureRow(row) && !isAnyArchiveRow(row) && !isArchivedProjectStructure(row);
};

/**
 * Check if row can be a drop target for dragging
 * Cannot drop on timeline rows, filter row, section dividers, or archive rows
 */
export const isValidDropTarget = (row: any): boolean => {
  return !(
    isTimelineRow(row) ||
    row._isFilterRow ||
    isSectionDivider(row) ||
    isAnyArchiveRow(row) ||
    isArchivedProjectStructure(row)
  );
};
