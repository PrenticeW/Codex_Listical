/**
 * Centralized configuration for all section text in the Goals/Staging tables.
 * This is the single source of truth for headers, prompts, and placeholders.
 */

export const SECTION_CONFIG = {
  Reasons: {
    header: 'Why do I want to start this?',
    prompt: 'Reason',
    placeholder: 'Reason',
  },
  Outcomes: {
    header: 'What do I want to be true in 12 weeks?',
    prompt: 'Outcome',
    placeholder: 'Measurable Outcome',
  },
  Actions: {
    header: 'For each outcome, what needs to happen and in what order?',
    prompt: 'Measurable Outcome',
    placeholder: 'Action',
  },
  Schedule: {
    header: 'Which activities need time allotted each week?',
    prompt: 'Schedule Item',
    placeholder: 'Schedule Item',
  },
  Subprojects: {
    header: 'What are the areas or stages of work your tasks will fall under?',
    prompt: 'Subproject',
    placeholder: 'Subproject',
  },
};

// Helper to get prompt text by section name (handles 'Needs' alias for 'Actions')
export const getSectionPrompt = (sectionName) => {
  const key = sectionName === 'Needs' ? 'Actions' : sectionName;
  return SECTION_CONFIG[key]?.prompt ?? '';
};

// Helper to get placeholder text by section name
export const getSectionPlaceholder = (sectionName) => {
  const key = sectionName === 'Needs' ? 'Actions' : sectionName;
  return SECTION_CONFIG[key]?.placeholder ?? '';
};

// Helper to get header text by section name
export const getSectionHeader = (sectionName) => {
  const key = sectionName === 'Needs' ? 'Actions' : sectionName;
  return SECTION_CONFIG[key]?.header ?? '';
};
