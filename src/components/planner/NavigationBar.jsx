import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, PanelRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { useGearPanel } from '../../contexts/GearPanelContext';
import { useSystemPanel } from '../../contexts/SystemPanelContext';
import { usePlanPanel } from '../../contexts/PlanPanelContext';
import { useGoalPanel } from '../../contexts/GoalPanelContext';

// Map routes to page identifiers and display names
const PAGE_CONFIG = {
  '/staging': { id: 'goal', name: 'Goal' },
  '/tactics': { id: 'plan', name: 'Plan' },
  '/': { id: 'system', name: 'System' },
};

const DRAFT_NAV_ITEMS = [
  { label: 'Goal', path: '/staging' },
  { label: 'Plan', path: '/tactics' },
  { label: 'System', path: '/' },
];

export default function NavigationBar({
  listicalButton = null,
  actionButton = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, user } = useAuth();
  const { draftYear, currentYear, switchToYear, isCurrentYearArchived } = useYear();

  // Get current page config
  const currentPageConfig = useMemo(() => {
    return PAGE_CONFIG[currentPath] || { id: 'global', name: 'Page' };
  }, [currentPath]);

  const { isOpen: gearPanelOpen, toggle: toggleGearPanel } = useGearPanel();
  const { isOpen: systemPanelOpen, toggle: toggleSystemPanel } = useSystemPanel();
  const { isOpen: planPanelOpen, toggle: togglePlanPanel } = usePlanPanel();
  const { isOpen: goalPanelOpen, toggle: toggleGoalPanel } = useGoalPanel();
  const isSystemPage = currentPath === '/';
  const isPlanPage = currentPath === '/tactics';
  const isGoalPage = currentPath === '/staging';

  const navItems = [
    { label: 'Goal', path: '/staging' },
    { label: 'Plan', path: '/tactics' },
    { label: 'System', path: '/' },
  ];

  const buttonClasses = (active) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
      active
        ? 'bg-slate-900 text-white shadow-sm'
        : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  // A draft nav button is active when we're on that path AND viewing the draft year
  const draftButtonClasses = (path) => {
    const isActive = currentPath === path && currentYear === draftYear?.yearNumber;
    return `rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ${
      isActive
        ? 'bg-violet-700 text-white shadow-sm'
        : 'bg-transparent text-violet-700 hover:bg-violet-50 hover:text-violet-900'
    }`;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleDraftNav = (path) => {
    if (!draftYear) return;
    switchToYear(draftYear.yearNumber);
    navigate(path);
  };

  return (
    <div data-nav="" className="flex flex-wrap items-center justify-between gap-4 shrink-0 w-full bg-white px-6 py-4 rounded-lg border border-slate-200/60 shadow-sm">
      <div className="flex items-center gap-4">
        {listicalButton ? <div className="relative">{listicalButton}</div> : null}

        {/* Active year nav buttons */}
        <div className="flex items-center gap-2">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={buttonClasses(currentPath === item.path && currentYear !== draftYear?.yearNumber)}
              onClick={() => {
                navigate(item.path);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Draft year nav group — only shown when a draft year exists */}
        {draftYear && (
          <>
            <div className="w-px h-6 bg-slate-200" aria-hidden="true" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mr-1 select-none">
                Y{draftYear.yearNumber}
              </span>
              {DRAFT_NAV_ITEMS.map((item) => (
                <button
                  key={`draft-${item.path}`}
                  type="button"
                  className={draftButtonClasses(item.path)}
                  onClick={() => handleDraftNav(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {isCurrentYearArchived && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1 select-none">
            Archived · Read only
          </span>
        )}
        {actionButton || null}


        {user && isGoalPage && (
          <button
            onClick={toggleGoalPanel}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
              goalPanelOpen
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 bg-transparent hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Goal actions"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
        {user && isPlanPage && (
          <button
            onClick={togglePlanPanel}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
              planPanelOpen
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 bg-transparent hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="Plan actions"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
        {user && isSystemPage && (
          <button
            onClick={toggleSystemPanel}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
              systemPanelOpen
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 bg-transparent hover:bg-slate-100 hover:text-slate-900'
            }`}
            title="System actions"
          >
            <PanelRight className="w-4 h-4" />
          </button>
        )}
        {user && (
          <>
            <button
              onClick={(e) => {
                const cls = typeof e.target.className === 'string' ? e.target.className : '[SVGAnimatedString]';
                console.log('[Nav] Gear icon onClick fired', {
                  isTrusted: e.nativeEvent.isTrusted,
                  target: `${e.target.tagName}.${cls.split(' ')[0]}`,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  timeStamp: e.timeStamp,
                });
                console.trace('[Nav] Gear icon call stack');
                toggleGearPanel();
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${gearPanelOpen ? 'bg-slate-900 text-white' : 'text-slate-600 bg-transparent hover:bg-slate-100 hover:text-slate-900'}`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
