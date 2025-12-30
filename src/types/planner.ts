/**
 * Type definitions for the Planner component
 * These types support both static row properties and dynamic day columns
 */

// Row type discriminators
export type RowType =
  | 'projectHeader'
  | 'projectGeneral'
  | 'projectUnscheduled'
  | 'subprojectHeader'
  | 'subprojectGeneral'
  | 'subprojectUnscheduled'
  | 'archiveHeader'
  | 'archiveRow';

// Core row interface with all possible properties
export interface PlannerRow {
  id: string;

  // Row type discriminators
  _rowType?: RowType;
  _isMonthRow?: boolean;
  _isWeekRow?: boolean;
  _isDayRow?: boolean;
  _isDayOfWeekRow?: boolean;
  _isDailyMinRow?: boolean;
  _isDailyMaxRow?: boolean;
  _isFilterRow?: boolean;
  _isInboxRow?: boolean;
  _isArchiveRow?: boolean;

  // Grouping and hierarchy
  groupId?: string;
  parentGroupId?: string;

  // Project metadata
  projectName?: string;
  projectNickname?: string;
  subprojectLabel?: string;

  // Core columns
  rowNum?: string | number;
  checkbox?: boolean | string;
  project?: string;
  subproject?: string;
  status?: string;
  task?: string;
  recurring?: string;
  estimate?: string;
  timeValue?: string;

  // Archive metadata
  archiveWeekLabel?: string;
  archiveTotalHours?: number;

  // Month/week span metadata
  _monthSpans?: Array<{ startDay: number; span: number; label: string }>;
  _weekSpans?: Array<{ startDay: number; span: number; label: string }>;

  // Dynamic day columns (day-0, day-1, ..., day-N)
  // Using index signature to allow dynamic day column access
  [dayColumnKey: `day-${number}`]: string | undefined;

  // Allow other properties for flexibility
  [key: string]: any;
}

// Cell reference for selection and editing
export interface CellReference {
  rowId: string;
  columnId: string;
}

// Edit state
export interface EditState {
  editingCell: CellReference | null;
  editValue: string;
}

// Drag and drop state
export interface DragState {
  draggedRowId: string[] | null;
  dropTargetRowId: string | null;
}

// Filter state for day columns
export interface DayColumnFilterState {
  dayColumnFilters: Set<string>;
}

// Collapsible groups state
export interface CollapsibleGroupsState {
  collapsedGroups: Set<string>;
}

// Command pattern interface for undo/redo
export interface Command {
  execute: () => void;
  undo: () => void;
}

// Hook return types
export interface UseEditStateReturn {
  editingCell: CellReference | null;
  editValue: string;
  setEditingCell: (cell: CellReference | null) => void;
  setEditValue: (value: string) => void;
  handleEditComplete: (rowId: string, columnId: string, newValue: string) => void;
  handleEditCancel: (rowId: string, columnId: string) => void;
  handleEditKeyDown: (e: React.KeyboardEvent, rowId: string, columnId: string, currentValue: string) => void;
}

export interface UseDragAndDropRowsReturn {
  draggedRowId: string[] | null;
  dropTargetRowId: string | null;
  setDraggedRowId: (rowId: string[] | null) => void;
  setDropTargetRowId: (rowId: string | null) => void;
  handleDragStart: (e: React.DragEvent, rowId: string) => void;
  handleDragOver: (e: React.DragEvent, rowId: string) => void;
  handleDrop: (e: React.DragEvent, targetRowId: string) => void;
  handleDragEnd: () => void;
}

export interface UseCollapsibleGroupsReturn {
  collapsedGroups: Set<string>;
  toggleGroupCollapse: (groupId: string) => void;
  isCollapsed: (groupId: string) => boolean;
}

export interface UseDayColumnFiltersReturn {
  dayColumnFilters: Set<string>;
  toggleDayFilter: (dayColumnId: string) => void;
  isDayFiltered: (dayColumnId: string) => boolean;
  clearAllDayFilters: () => void;
}

export interface UseComputedDataReturn {
  computedData: PlannerRow[];
}
