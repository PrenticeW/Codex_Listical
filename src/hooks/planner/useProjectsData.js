/**
 * Projects Data Hook
 * Loads projects and subprojects from Staging storage
 */

import { useCallback } from 'react';
import { useYear } from '../../contexts/YearContext';
import { loadStagingState, peekStagingCache, STAGING_STORAGE_EVENT } from '../../lib/stagingStorage';
import { SECTION_CONFIG } from '../../utils/staging/sectionConfig';
import useStorageSync from '../common/useStorageSync';

const SUBPROJECT_PLACEHOLDER = SECTION_CONFIG.Subprojects.placeholder;

/**
 * Hook to load projects and subprojects from Staging storage
 * Automatically updates when staging data changes or year changes
 *
 * @returns {Object} Projects and subprojects data
 */
export default function useProjectsData() {
  const { currentYear } = useYear();

  // Memoize the load function. Async since the Supabase port.
  const loadData = useCallback(async () => {
    const { shortlist } = await loadStagingState(currentYear);
    return extractProjectsData(shortlist);
  }, [currentYear]);

  // Memoize the extract function for storage sync. The event payload already
  // includes the live shortlist, so this is sync in the happy path.
  const extractData = useCallback(async (payload) => {
    const shortlist = payload?.shortlist
      || (await loadStagingState(currentYear)).shortlist;
    return extractProjectsData(shortlist);
  }, [currentYear]);

  // Peek the in-memory staging cache for a synchronous initial value so the
  // first render already has the full projects list when the cache is warm.
  // Prevents the project-rows-inserter effect on System from stripping rows
  // for projects that "aren't in the plan" during the async load window.
  const cachedShortlist = peekStagingCache(currentYear)?.shortlist;

  const [projectsData, , isLoaded] = useStorageSync({
    loadData,
    customEventName: STAGING_STORAGE_EVENT,
    storageKeys: [`staging-year-${currentYear}-state`, 'staging-state'],
    extractData,
    dependency: currentYear,
    currentYearNumber: currentYear, // H3: ignore staging events from other years
    initialValue: extractProjectsData(cachedShortlist || []),
  });

  const result = projectsData ?? extractProjectsData([]);
  // isProjectsLoaded: true once the async staging load has completed OR the
  // cache provided a full shortlist on the first render. Consumers that make
  // destructive decisions (e.g. removing rows for projects "not in the plan")
  // should gate on this to avoid acting on the default empty list.
  return { ...result, isProjectsLoaded: isLoaded || !!cachedShortlist };
}

/**
 * Extract projects and subprojects from staging shortlist
 * @param {Array} shortlist - Staging shortlist array
 * @returns {Object} Extracted projects and subprojects
 */
export function extractProjectsData(shortlist) {
  if (!Array.isArray(shortlist) || shortlist.length === 0) {
    return {
      projects: ['-'],
      subprojects: ['-'],
      projectSubprojectsMap: {},
      projectNamesMap: {},
      projectTaglinesMap: {},
      projectIdByNickname: new Map(),
    };
  }

  const projects = ['-'];
  const allSubprojects = new Set(['-']);
  const projectSubprojectsMap = {};
  const projectNamesMap = {}; // Map from nickname/key to full project name
  const projectTaglinesMap = {}; // Map from nickname/key to tagline
  const projectIdByNickname = new Map(); // Nickname/key -> stable project id (join key for quotas)

  shortlist.forEach(item => {
    const fullProjectName = (item.projectName || item.text || '').trim();
    const nickname = (item.projectNickname || '').trim();

    // Use nickname as key if available, otherwise use full name
    const projectKey = nickname || fullProjectName;

    if (projectKey && projectKey !== '-' && item.addedToPlan === true) {
      projects.push(projectKey);
      projectSubprojectsMap[projectKey] = ['-'];

      // Store the mapping from key to full project name
      projectNamesMap[projectKey] = fullProjectName || projectKey;

      // Store tagline
      projectTaglinesMap[projectKey] = (item.projectTagline || '').trim();

      // Store nickname -> id mapping so downstream consumers (e.g. quota lookup
      // in System) can translate a display nickname into the stable id that
      // survives project renames.
      if (item.id) {
        projectIdByNickname.set(projectKey, item.id);
      }

      // Extract subprojects by scanning for rows in the Subprojects section.
      // StagingPageV2 inserts subproject rows as 'prompt' type (name at col 1)
      // or legacy 'data' type (name at col 0). Section membership is determined
      // by walking backwards from each row to find the nearest 'header' row with
      // __sectionType === 'Subprojects'.
      if (Array.isArray(item.planTableEntries) && item.planTableEntries.length > 0) {
        let inSubprojectsSection = false;
        for (const row of item.planTableEntries) {
          if (row?.__rowType === 'header') {
            inSubprojectsSection = row.__sectionType === 'Subprojects';
            continue;
          }
          if (!inSubprojectsSection) continue;
          if (row?.__rowType === 'prompt') {
            // Prompt rows: name is at col 1 (Schedule uses col 2, Subprojects uses col 1)
            const name = (row[1] ?? '').trim();
            if (name && name !== '-' && name !== SUBPROJECT_PLACEHOLDER) {
              allSubprojects.add(name);
              projectSubprojectsMap[projectKey].push(name);
            }
          } else if (row?.__rowType === 'data' || !row?.__rowType) {
            // Legacy data rows: name may be at col 0
            const name = (row[0] ?? '').trim();
            if (name && name !== '-' && name !== SUBPROJECT_PLACEHOLDER) {
              allSubprojects.add(name);
              projectSubprojectsMap[projectKey].push(name);
            }
          }
        }
      }
    }
  });

  return {
    projects,
    subprojects: Array.from(allSubprojects),
    projectSubprojectsMap,
    projectNamesMap,
    projectTaglinesMap,
    projectIdByNickname,
  };
}
