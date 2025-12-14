// ============================================================
// PLANNER CONSTANTS
// Centralized constants for the Project Time Planner
// ============================================================

// ============================================================
// TIME & DATE CONSTANTS
// ============================================================
export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// ============================================================
// ROW TYPE CONSTANTS
// ============================================================
export const PROTECTED_STATUSES = new Set(['Done', 'Abandoned', 'Blocked', 'On Hold', 'Skipped', 'Special']);
export const TASK_ROW_TYPES = new Set(['projectTask', 'inboxItem']);
export const FILTERABLE_ROW_TYPES = new Set([
  'projectTask',
  'inboxItem',
  'projectHeader',
  'projectGeneral',
  'projectUnscheduled',
]);

// ============================================================
// DROPDOWN VALUES
// ============================================================
export const STATUS_VALUES = ['Not Scheduled', 'Scheduled', 'Done', 'Blocked', 'On Hold', 'Abandoned'];
export const RECURRING_VALUES = ['Recurring', 'Not Recurring'];
export const ESTIMATE_VALUES = [
  '-',
  'Custom',
  '1 Minute',
  ...Array.from({ length: 11 }, (_, i) => `${(i + 1) * 5} Minutes`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => `${h} Hour${h > 1 ? 's' : ''}`),
];

// ============================================================
// SORTING & ORGANIZATION
// ============================================================
export const SORTABLE_STATUSES = ['Done', 'Scheduled', 'Not Scheduled', 'Abandoned', 'Blocked', 'On Hold'];
export const SORT_INBOX_TARGET_MAP = {
  Done: 'general',
  Scheduled: 'general',
  'Not Scheduled': 'unscheduled',
  Abandoned: 'unscheduled',
  Blocked: 'unscheduled',
  'On Hold': 'unscheduled',
};

// ============================================================
// COLUMN & ROW DIMENSIONS
// ============================================================
export const COL_W = {
  rowLabel: 36,
  check: 24,
  project: 120,
  subprojects: 150,
  status: 120,
  task: 240,
  recurring: 80,
  estimate: 100,
  timeValue: 80,
  day: 60,
};

export const ROW_H = 26;
export const MIN_COLUMN_WIDTH = 40;
export const COLUMN_RESIZE_HANDLE_WIDTH = 10;

// ============================================================
// COLOR MAPS & STYLES
// ============================================================
export const STATUS_COLOR_MAP = {
  'Not Scheduled': { bg: '#e5e5e5', text: '#000000' },
  Scheduled: { bg: '#ffe5a0', text: '#473821' },
  Done: { bg: '#c9e9c0', text: '#276436' },
  Abandoned: { bg: '#e8d9f3', text: '#5a3b74' },
  Blocked: { bg: '#f3c4c4', text: '#9c2f2f' },
  'On Hold': { bg: '#505050', text: '#ffffff' },
  Special: { bg: '#cce3ff', text: '#3a70b7' },
};

export const ROW_LABEL_BASE_STYLE = { backgroundColor: '#d9f6e0', color: '#065f46' };
export const DARK_HEADER_STYLE = { backgroundColor: '#000000', color: '#ffffff' };
export const ARCHIVE_ROW_STYLE = { backgroundColor: '#d9f6e0', color: '#000000' };

// ============================================================
// STORAGE KEYS
// ============================================================
export const SETTINGS_STORAGE_KEY = 'listical-settings';
export const TASK_ROWS_STORAGE_KEY = 'listical-task-rows';
