/**
 * Centralized configuration for all section text in the Goals/Staging tables.
 * This is the single source of truth for headers, prompts, and ghost copy.
 *
 * `prompt` / `placeholder` are seeded into cells as real values — they are
 * intentionally empty now: new rows start blank and the `ghost` /
 * `responseGhost` copy is shown as input placeholder text instead
 * (disappears as soon as the user types). Matches goals_table.html mockup.
 */

export const SECTION_CONFIG = {
  Reasons: {
    header: 'Why do you want to achieve this goal?',
    prompt: '',
    placeholder: '',
    ghost: 'Add reason...',
    responseGhost: 'Add action',
  },
  Outcomes: {
    header: 'What are your desired outcomes for this goal?',
    prompt: '',
    placeholder: '',
    ghost: 'Add desired outcome...',
    responseGhost: 'What measurable outcome would confirm this desire has been met?',
  },
  Actions: {
    header: 'What actions are needed for your outcomes?',
    prompt: '',
    placeholder: '',
    ghost: 'Add outcome...',
    responseGhost: 'Add action',
  },
  Schedule: {
    header: 'What time is needed for your actions?',
    prompt: '',
    placeholder: '',
    ghost: 'Add schedule item...',
    responseGhost: 'Add action',
  },
  Subprojects: {
    header: 'What are the areas or stages of work your tasks will fall under?',
    prompt: '',
    placeholder: '',
    ghost: 'Add subproject...',
    responseGhost: '',
  },
};

// Legacy seeded values (pre-ghost-copy). Used to normalize stored tables:
// cells holding exactly these values are treated as empty, and old header
// questions are upgraded to the current wording.
export const LEGACY_SEED_VALUES = new Set([
  'Reason',
  'Outcome',
  'Measurable Outcome',
  'Action',
  'Schedule Item',
  'Subproject',
]);

export const LEGACY_HEADERS = {
  'Why do I want to start this?': SECTION_CONFIG.Reasons.header,
  'What do I want to be true in 12 weeks?': SECTION_CONFIG.Outcomes.header,
  'For each outcome, what needs to happen and in what order?': SECTION_CONFIG.Actions.header,
  'Which activities need time allotted each week?': SECTION_CONFIG.Schedule.header,
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

// Helper to get ghost (input placeholder) copy by section name and row type
export const getSectionGhost = (sectionName, rowType = 'prompt') => {
  const key = sectionName === 'Needs' ? 'Actions' : sectionName;
  const cfg = SECTION_CONFIG[key];
  if (!cfg) return '';
  return rowType === 'response' ? cfg.responseGhost : cfg.ghost;
};
