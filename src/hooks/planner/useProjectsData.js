/**
 * Projects Data Hook
 * Loads projects and subprojects from Staging storage
 */

import { useCallback } from 'react';
import { useYear } from '../../contexts/YearContext';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../../lib/stagingStorage';
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

  // Memoize the load function to prevent unnecessary recreations
  const loadData = useCallback(() => {
    const { shortlist } = loadStagingState(currentYear);
    return extractProjectsData(shortlist);
  }, [currentYear]);

  // Memoize the extract function for storage sync
  const extractData = useCallback((payload) => {
    const shortlist = payload?.shortlist || loadStagingState(currentYear).shortlist;
    return extractProjectsData(shortlist);
  }, [currentYear]);

  const [projectsData] = useStorageSync({
    loadData,
    customEventName: STAGING_STORAGE_EVENT,
    storageKeys: [`staging-year-${currentYear}-state`, 'staging-state'],
    extractData,
    dependency: currentYear,
  });

  return projectsData;
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
    const fullProjectName = (item.projectName || '').trim();
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
