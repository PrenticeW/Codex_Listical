/**
 * Storage Key Definitions for Project Time Planner
 * Centralized definitions for all localStorage keys
 */

// ============================================================
// DEFAULT PROJECT ID
// ============================================================

/**
 * Default project identifier for first 12-week period
 * Used when no specific projectId is provided
 */
export const DEFAULT_PROJECT_ID = 'project-1';

// ============================================================
// MULTI-PROJECT STORAGE KEY TEMPLATES
// ============================================================
// Use {projectId} as placeholder for project-specific keys
// Pattern: planner-v2-{projectId}-{setting}

/**
 * Column sizing storage key template
 * Stores individual column widths for table columns
 *
 * Example: planner-v2-project-1-column-sizing
 * Example: planner-v2-project-2-column-sizing
 */
export const COLUMN_SIZING_KEY_TEMPLATE = 'planner-v2-{projectId}-column-sizing';

/**
 * Size scale storage key template
 * Stores UI scale factor (0.5 to 3.0, default 1.0)
 * Affects row height, font size, and icon sizes
 *
 * Example: planner-v2-project-1-size-scale
 * Example: planner-v2-project-2-size-scale
 */
export const SIZE_SCALE_KEY_TEMPLATE = 'planner-v2-{projectId}-size-scale';

/**
 * Start date storage key template
 * Stores the timeline start date in YYYY-MM-DD format
 *
 * Example: planner-v2-project-1-start-date
 */
export const START_DATE_KEY_TEMPLATE = 'planner-v2-{projectId}-start-date';

/**
 * Show recurring column storage key template
 * Stores boolean for recurring column visibility
 *
 * Example: planner-v2-project-1-show-recurring
 */
export const SHOW_RECURRING_KEY_TEMPLATE = 'planner-v2-{projectId}-show-recurring';

/**
 * Show subprojects column storage key template
 * Stores boolean for subprojects column visibility
 *
 * Example: planner-v2-project-1-show-subprojects
 */
export const SHOW_SUBPROJECTS_KEY_TEMPLATE = 'planner-v2-{projectId}-show-subprojects';

/**
 * Show max/min rows storage key template
 * Stores boolean for daily max/min rows visibility
 *
 * Example: planner-v2-project-1-show-max-min-rows
 */
export const SHOW_MAX_MIN_ROWS_KEY_TEMPLATE = 'planner-v2-{projectId}-show-max-min-rows';

/**
 * Selected sort statuses storage key template
 * Stores array of selected status values for "Sort Inbox" feature
 *
 * Example: planner-v2-project-1-sort-statuses
 */
export const SORT_STATUSES_KEY_TEMPLATE = 'planner-v2-{projectId}-sort-statuses';

/**
 * Selected sort planner statuses storage key template
 * Stores array of selected status values for "Sort Planner" feature
 *
 * Example: planner-v2-project-1-sort-planner-statuses
 */
export const SORT_PLANNER_STATUSES_KEY_TEMPLATE = 'planner-v2-{projectId}-sort-planner-statuses';

/**
 * Task rows data storage key template
 * Stores the actual task row data (spreadsheet content)
 *
 * Example: planner-v2-project-1-task-rows
 */
export const TASK_ROWS_KEY_TEMPLATE = 'planner-v2-{projectId}-task-rows';

/**
 * Total days storage key template
 * Stores the number of days displayed in the timeline (84 = 12 weeks by default)
 *
 * Example: planner-v2-project-1-total-days
 */
export const TOTAL_DAYS_KEY_TEMPLATE = 'planner-v2-{projectId}-total-days';

/**
 * Visible day columns storage key template
 * Stores object mapping day column IDs to visibility booleans
 *
 * Example: planner-v2-project-1-visible-day-columns
 */
export const VISIBLE_DAY_COLUMNS_KEY_TEMPLATE = 'planner-v2-{projectId}-visible-day-columns';

// ============================================================
// LEGACY KEYS (Backward Compatibility)
// ============================================================
// These keys are maintained in /src/constants/plannerConstants.js:
// - SETTINGS_STORAGE_KEY = 'listical-settings'
// - TASK_ROWS_STORAGE_KEY = 'listical-task-rows'
//
// Import these from plannerConstants.js when needed for backward compatibility
