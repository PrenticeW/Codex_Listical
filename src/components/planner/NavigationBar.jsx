import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, RotateCcw, Undo2 } from 'lucide-react';
import YearSelector from '../YearSelector';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { useGearPanel } from '../../contexts/GearPanelContext';

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
  yearSelector = null,
  actionButton = null,
  onUndoDraft = null,
  onRevertArchive = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, user } = useAuth();
  const { draftYear, activeYear, currentYear, switchToYear } = useYear();

  // Get current page config
  const currentPageConfig = useMemo(() => {
    return PAGE_CONFIG[currentPath] || { id: 'global', name: 'Page' };
  }, [currentPath]);

  const { toggle: toggleGearPanel } = useGearPanel();

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
                if (activeYear && currentYear !== activeYear.yearNumber) {
                  switchToYear(activeYear.yearNumber);
                }
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
        {actionButton || null}

        {/* Dev undo button — remove before launch */}
        {onUndoDraft && (
          <button
            type="button"
            onClick={onUndoDraft}
            className="px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-300 rounded-lg hover:bg-rose-100 transition-all duration-200 flex items-center gap-1.5"
            title="Undo draft year (dev only)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Undo Draft
          </button>
        )}

        {/* Dev revert archive button — remove before launch */}
        {onRevertArchive && (
          <button
            type="button"
            onClick={onRevertArchive}
            className="px-3 py-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-all duration-200 flex items-center gap-1.5"
            title="Revert last archive — demote active back to draft, un-archive previous year (dev only)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Revert Archive
          </button>
        )}

        {yearSelector || <YearSelector />}
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
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-transparent rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all duration-200 flex items-center gap-2"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-transparent rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all duration-200 flex items-center gap-2"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
