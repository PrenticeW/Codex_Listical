/**
 * Projects Data Hook
 * Loads projects and subprojects from Staging storage
 */

import { useState, useEffect } from 'react';
import { loadStagingState, STAGING_STORAGE_EVENT } from '../../lib/stagingStorage';

/**
 * Hook to load projects and subprojects from Staging storage
 * Automatically updates when staging data changes
 *
 * @returns {Object} Projects and subprojects data
 */
export default function useProjectsData() {
  const [projectsData, setProjectsData] = useState(() => {
    const { shortlist } = loadStagingState();
    return extractProjectsData(shortlist);
  });

  // Listen for staging storage updates
  useEffect(() => {
    const handleStorageUpdate = (event) => {
      const shortlist = event.detail?.shortlist || loadStagingState().shortlist;
      setProjectsData(extractProjectsData(shortlist));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(STAGING_STORAGE_EVENT, handleStorageUpdate);
      return () => {
        window.removeEventListener(STAGING_STORAGE_EVENT, handleStorageUpdate);
      };
    }
  }, []);

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
