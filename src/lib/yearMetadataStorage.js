/**
 * Year Metadata Storage
 *
 * Manages year-level metadata for the cycle-based planning system.
 * Each "year" represents a complete 12-week planning cycle.
 *
 * Storage backend: Supabase (`years` table + `profiles.current_year_id`).
 * All read and write operations are async. The legacy in-memory `YearMetadata`
 * shape ({ currentYear, years: YearInfo[] }) is preserved at the function
 * boundary so callers do not need to relearn the data model.
 *
 * The `yearMetadataStorage` window event still fires after every successful
 * mutation. Its detail payload is the freshly fetched YearMetadata blob so
 * YearContext listeners can swap state without doing their own refetch.
 */

import { supabase } from './supabase';

/**
 * @typedef {Object} YearInfo
 * @property {number} yearNumber
 * @property {'active' | 'archived' | 'draft'} status
 * @property {string} startDate   ISO date string (YYYY-MM-DD)
 * @property {string|null} endDate
 * @property {string|null} archivedAt
 * @property {number} totalWeeksCompleted
 * @property {number} totalHoursCompleted  // hours, with minute precision stored as N/60
 */

/**
 * @typedef {Object} YearMetadata
 * @property {number} currentYear
 * @property {YearInfo[]} years
 */

const YEAR_METADATA_EVENT = 'yearMetadataStorage';

// --- internal helpers --------------------------------------------------

async function requireUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('No authenticated user');
  }
  return user.id;
}

function dbRowToYearInfo(row) {
  return {
    yearNumber: row.year_number,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    archivedAt: row.archived_at,
    totalWeeksCompleted: row.total_weeks_completed ?? 0,
    totalHoursCompleted: (row.total_hours_completed_minutes ?? 0) / 60,
  };
}

function infoUpdatesToDbColumns(updates) {
  const dbUpdates = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'status'))
    dbUpdates.status = updates.status;
  if (Object.prototype.hasOwnProperty.call(updates, 'startDate'))
    dbUpdates.start_date = updates.startDate;
  if (Object.prototype.hasOwnProperty.call(updates, 'endDate'))
    dbUpdates.end_date = updates.endDate;
  if (Object.prototype.hasOwnProperty.call(updates, 'archivedAt'))
    dbUpdates.archived_at = updates.archivedAt;
  if (Object.prototype.hasOwnProperty.call(updates, 'totalWeeksCompleted'))
    dbUpdates.total_weeks_completed = updates.totalWeeksCompleted;
  if (Object.prototype.hasOwnProperty.call(updates, 'totalHoursCompleted'))
    dbUpdates.total_hours_completed_minutes = Math.round((updates.totalHoursCompleted ?? 0) * 60);
  return dbUpdates;
}

async function dispatchMetadataEvent() {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  const metadata = await readYearMetadata();
  window.dispatchEvent(new CustomEvent(YEAR_METADATA_EVENT, { detail: metadata }));
}

async function findYearIdByNumber(userId, yearNumber) {
  const { data, error } = await supabase
    .from('years')
    .select('id')
    .eq('user_id', userId)
    .eq('year_number', yearNumber)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// --- public read API ---------------------------------------------------

/**
 * Read year metadata.
 * @returns {Promise<YearMetadata|null>}
 */
export async function readYearMetadata() {
  try {
    const userId = await requireUserId();

    const [yearsResult, profileResult] = await Promise.all([
      supabase
        .from('years')
        .select('*')
        .eq('user_id', userId)
        .order('year_number'),
      supabase
        .from('profiles')
        .select('current_year_id')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (yearsResult.error) throw yearsResult.error;
    if (profileResult.error) throw profileResult.error;

    const rows = yearsResult.data ?? [];
    if (rows.length === 0) return null;

    const currentYearRow = profileResult.data?.current_year_id
      ? rows.find((row) => row.id === profileResult.data.current_year_id)
      : null;
    const currentYear = currentYearRow?.year_number ?? rows[0].year_number;

    return {
      currentYear,
      years: rows.map(dbRowToYearInfo),
    };
  } catch (error) {
    console.error('Failed to read year metadata:', error);
    return null;
  }
}

/**
 * Get the current active year number. Defaults to 1 when no metadata exists.
 * @returns {Promise<number>}
 */
export async function getCurrentYear() {
  const metadata = await readYearMetadata();
  return metadata ? metadata.currentYear : 1;
}

/**
 * Get information about a specific year.
 * @param {number} yearNumber
 * @returns {Promise<YearInfo|null>}
 */
export async function getYearInfo(yearNumber) {
  const metadata = await readYearMetadata();
  if (!metadata) return null;
  return metadata.years.find((y) => y.yearNumber === yearNumber) || null;
}

/**
 * Get all years sorted by year number.
 * @returns {Promise<YearInfo[]>}
 */
export async function getAllYears() {
  const metadata = await readYearMetadata();
  if (!metadata) return [];
  return [...metadata.years].sort((a, b) => a.yearNumber - b.yearNumber);
}

/**
 * Get the active year info.
 * @returns {Promise<YearInfo|null>}
 */
export async function getActiveYear() {
  const metadata = await readYearMetadata();
  if (!metadata) return null;
  return metadata.years.find((y) => y.status === 'active') || null;
}

/**
 * Get all archived years (most recent first).
 * @returns {Promise<YearInfo[]>}
 */
export async function getArchivedYears() {
  const metadata = await readYearMetadata();
  if (!metadata) return [];
  return metadata.years
    .filter((y) => y.status === 'archived')
    .sort((a, b) => b.yearNumber - a.yearNumber);
}

/**
 * Get the current draft year, if one exists.
 * @returns {Promise<YearInfo|null>}
 */
export async function getDraftYear() {
  const metadata = await readYearMetadata();
  if (!metadata) return null;
  return metadata.years.find((y) => y.status === 'draft') || null;
}

/**
 * Check if a year exists.
 * @param {number} yearNumber
 * @returns {Promise<boolean>}
 */
export async function yearExists(yearNumber) {
  const info = await getYearInfo(yearNumber);
  return info !== null;
}

// --- public write API --------------------------------------------------

/**
 * Write the full metadata blob back to Supabase. Provided for parity with
 * the legacy API; new code should prefer the narrower mutation functions
 * below (createNewYear, archiveYear, etc.) so the database is updated row
 * by row rather than via an expensive replace-all.
 *
 * Currently implemented as an "update existing rows in place, insert any
 * new ones" pass. Rows present in Supabase but absent from the supplied
 * metadata are NOT deleted — that path is too easy to misuse. Use the
 * dedicated delete helpers when you need to remove a year.
 *
 * @param {YearMetadata} metadata
 */
export async function saveYearMetadata(metadata) {
  if (!metadata || !Array.isArray(metadata.years)) return;
  try {
    const userId = await requireUserId();

    for (const year of metadata.years) {
      const existingId = await findYearIdByNumber(userId, year.yearNumber);
      const row = {
        user_id: userId,
        year_number: year.yearNumber,
        status: year.status,
        start_date: year.startDate,
        end_date: year.endDate ?? null,
        archived_at: year.archivedAt ?? null,
        total_weeks_completed: year.totalWeeksCompleted ?? 0,
        total_hours_completed_minutes: Math.round((year.totalHoursCompleted ?? 0) * 60),
      };

      if (existingId) {
        const { error } = await supabase
          .from('years')
          .update(row)
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('years').insert(row);
        if (error) throw error;
      }
    }

    // Sync currentYear pointer if present.
    if (typeof metadata.currentYear === 'number') {
      await setCurrentYear(metadata.currentYear);
    }

    await dispatchMetadataEvent();
  } catch (error) {
    console.error('Failed to save year metadata:', error);
  }
}

/**
 * Initialise year metadata for a first-time user. Creates Year 1 as the
 * active year and points the profile at it.
 *
 * @param {string} startDate
 * @returns {Promise<YearMetadata|null>}
 */
export async function initializeYearMetadata(startDate) {
  try {
    const userId = await requireUserId();

    const { data: insertedYear, error: insertErr } = await supabase
      .from('years')
      .insert({
        user_id: userId,
        year_number: 1,
        status: 'active',
        start_date: startDate,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ current_year_id: insertedYear.id })
      .eq('id', userId);
    if (profileErr) throw profileErr;

    await dispatchMetadataEvent();
    return readYearMetadata();
  } catch (error) {
    console.error('Failed to initialise year metadata:', error);
    return null;
  }
}

/**
 * Update specific year info.
 * @param {number} yearNumber
 * @param {Partial<YearInfo>} updates
 */
export async function updateYearInfo(yearNumber, updates) {
  try {
    const userId = await requireUserId();
    const dbUpdates = infoUpdatesToDbColumns(updates);
    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase
      .from('years')
      .update(dbUpdates)
      .eq('user_id', userId)
      .eq('year_number', yearNumber);
    if (error) throw error;

    await dispatchMetadataEvent();
  } catch (error) {
    console.error('Failed to update year info:', error);
  }
}

/**
 * Set the current active year by year number.
 * @param {number} yearNumber
 */
export async function setCurrentYear(yearNumber) {
  try {
    const userId = await requireUserId();
    const yearId = await findYearIdByNumber(userId, yearNumber);
    if (!yearId) throw new Error(`Year ${yearNumber} does not exist`);

    const { error } = await supabase
      .from('profiles')
      .update({ current_year_id: yearId })
      .eq('id', userId);
    if (error) throw error;

    await dispatchMetadataEvent();
  } catch (error) {
    console.error('Failed to set current year:', error);
  }
}

/**
 * Create a new active year.
 * @param {number} yearNumber
 * @param {string} startDate
 * @returns {Promise<YearInfo|null>}
 */
export async function createNewYear(yearNumber, startDate) {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('years')
      .insert({
        user_id: userId,
        year_number: yearNumber,
        status: 'active',
        start_date: startDate,
      })
      .select()
      .single();
    if (error) throw error;

    await dispatchMetadataEvent();
    return dbRowToYearInfo(data);
  } catch (error) {
    console.error('Failed to create new year:', error);
    return null;
  }
}

/**
 * Archive a year.
 * @param {number} yearNumber
 * @param {{ totalWeeksCompleted: number, totalHoursCompleted: number }} stats
 */
export async function archiveYear(yearNumber, stats) {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  await updateYearInfo(yearNumber, {
    status: 'archived',
    endDate: today,
    archivedAt: now,
    totalWeeksCompleted: stats.totalWeeksCompleted,
    totalHoursCompleted: stats.totalHoursCompleted,
  });
}

/**
 * Create a draft year (next cycle in planning mode, not yet active).
 * @param {number} yearNumber
 * @param {string} startDate
 * @returns {Promise<YearInfo|null>}
 */
export async function createDraftYear(yearNumber, startDate) {
  try {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('years')
      .insert({
        user_id: userId,
        year_number: yearNumber,
        status: 'draft',
        start_date: startDate,
      })
      .select()
      .single();
    if (error) throw error;

    await dispatchMetadataEvent();
    return dbRowToYearInfo(data);
  } catch (error) {
    console.error('Failed to create draft year:', error);
    return null;
  }
}

/**
 * Promote a draft year to active status.
 * @param {number} yearNumber
 */
export async function promoteDraftToActive(yearNumber) {
  await updateYearInfo(yearNumber, { status: 'active' });
}

/**
 * Delete a draft year record from metadata.
 *
 * Per the new schema this CASCADEs through every year-scoped planning table
 * (projects, planner_rows, archived_weeks, tactics_*, planner_settings) via
 * the year_id foreign keys defined in 20260516000001_planning_schema.sql.
 * On the localStorage version this only removed the metadata entry and
 * relied on Undo Draft helpers to wipe other keys; on Supabase the cascade
 * does the work for us.
 *
 * @param {number} yearNumber
 */
export async function deleteDraftYearRecord(yearNumber) {
  try {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('years')
      .delete()
      .eq('user_id', userId)
      .eq('year_number', yearNumber);
    if (error) throw error;

    await dispatchMetadataEvent();
  } catch (error) {
    console.error('Failed to delete draft year record:', error);
  }
}

// --- pure date utilities (unchanged) ----------------------------------

/**
 * Calculate the end date for a 12-week cycle.
 * @param {string} startDate
 * @returns {string}
 */
export function calculateCycleEndDate(startDate) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + (12 * 7) - 1); // 12 weeks minus 1 day
  return date.toISOString().split('T')[0];
}

/**
 * Calculate the start date of the next cycle.
 * @param {string} previousStartDate
 * @returns {string}
 */
export function calculateNextCycleStartDate(previousStartDate) {
  const date = new Date(previousStartDate);
  date.setDate(date.getDate() + (12 * 7)); // 12 weeks later
  return date.toISOString().split('T')[0];
}
