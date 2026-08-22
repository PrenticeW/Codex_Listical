/**
 * Place Imported Tasks
 *
 * Inserts imported tasks at the correct position in the existing data array
 * so that assignParentGroupIds (in the render pipeline) can assign them the
 * right parentGroupId based on positional context.
 *
 * - Tasks with a valid projectNickname → inserted after the projectUnscheduled
 *   row for that project (landing in the Unscheduled section).
 * - Tasks with no projectNickname (inbox-bound) → inserted after the inbox divider.
 */

/**
 * @param {Object[]} existingData  — current data array (with headers, inbox, archive)
 * @param {Object[]} importedTasks — tasks to insert (already reset for new year)
 * @returns {Object[]} new data array with tasks inserted at correct positions
 */
export function placeImportedTasks(existingData, importedTasks) {
  // Idempotent: skip tasks already present (guards against a double-applied
  // state updater, e.g. React StrictMode).
  const existingIds = new Set(existingData.map((r) => r.id));
  const fresh = importedTasks.filter((t) => !existingIds.has(t.id));
  if (fresh.length === 0) return existingData;

  // Group tasks by target project
  const byProject = {};   // nickname → tasks[]
  const inboxTasks = [];

  for (const task of fresh) {
    const nickname = task.projectNickname;
    if (!nickname || nickname === '-') {
      inboxTasks.push(task);
    } else {
      if (!byProject[nickname]) byProject[nickname] = [];
      byProject[nickname].push(task);
    }
  }

  // Build the result by walking through existingData and inserting task groups
  const result = [];

  for (let i = 0; i < existingData.length; i++) {
    const row = existingData[i];
    result.push(row);

    // Insert project tasks after the projectUnscheduled row for that project
    if (row._rowType === 'projectUnscheduled') {
      const nickname = row.projectNickname || extractNicknameFromId(row.id);
      if (nickname && byProject[nickname]) {
        result.push(...byProject[nickname]);
        delete byProject[nickname];
      }
    }

    // Insert inbox tasks after the inbox divider
    if (row._isInboxRow && inboxTasks.length > 0) {
      result.push(...inboxTasks);
      inboxTasks.length = 0; // clear
    }
  }

  // Any remaining project tasks that didn't find their header go to inbox
  const leftover = Object.values(byProject).flat().map((t) => ({
    ...t, project: '', projectNickname: '', projectId: null, subproject: '',
  }));
  if (leftover.length > 0 || inboxTasks.length > 0) {
    const inboxIndex = result.findIndex((r) => r._isInboxRow);
    const archiveIndex = result.findIndex((r) => r._rowType === 'archiveHeader');
    let insertAt;
    if (inboxIndex >= 0) {
      // After the inbox divider and any inbox tasks already placed above
      insertAt = archiveIndex > inboxIndex ? archiveIndex : result.length;
    } else {
      // No inbox divider yet: never strand rows under the Archive header
      insertAt = archiveIndex >= 0 ? archiveIndex : result.length;
    }
    result.splice(insertAt, 0, ...leftover, ...inboxTasks);
  }

  return result;
}

/**
 * Extract project nickname from structural row IDs like "myProject-unscheduled"
 */
function extractNicknameFromId(id) {
  if (!id) return null;
  const match = id.match(/^(.+)-unscheduled$/);
  return match ? match[1] : null;
}
