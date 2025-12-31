/**
 * Projects Data Hook
 * Loads projects and subprojects from Staging storage
 */

import { useCallback, useMemo } from 'react';
import { useYear } from '../../contexts/YearContext';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../../lib/stagingStorage';
import useStorageSync from '../common/useStorageSync';

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
function extractProjectsData(shortlist) {
  if (!Array.isArray(shortlist) || shortlist.length === 0) {
    return {
      projects: ['-'],
      subprojects: ['-'],
      projectSubprojectsMap: {},
      projectNamesMap: {},
    };
  }

  const projects = ['-'];
  const allSubprojects = new Set(['-']);
  const projectSubprojectsMap = {};
  const projectNamesMap = {}; // Map from nickname/key to full project name

  shortlist.forEach(item => {
    const fullProjectName = (item.projectName || '').trim();
    const nickname = (item.projectNickname || '').trim();

    // Use nickname as key if available, otherwise use full name
    const projectKey = nickname || fullProjectName;

    if (projectKey && projectKey !== '-') {
      projects.push(projectKey);
      projectSubprojectsMap[projectKey] = ['-'];

      // Store the mapping from key to full project name
      projectNamesMap[projectKey] = fullProjectName || projectKey;

      // Extract subprojects from planSummary
      if (item.planSummary && Array.isArray(item.planSummary.subprojects)) {
        item.planSummary.subprojects.forEach(subproject => {
          const subprojectName = (subproject.name || '').trim();
          if (subprojectName && subprojectName !== '-') {
            allSubprojects.add(subprojectName);
            projectSubprojectsMap[projectKey].push(subprojectName);
          }
        });
      }
    }
  });

  return {
    projects,
    subprojects: Array.from(allSubprojects),
    projectSubprojectsMap,
    projectNamesMap,
  };
}
