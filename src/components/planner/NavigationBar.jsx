import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, RotateCcw } from 'lucide-react';
import YearSelector from '../YearSelector';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import usePageSize from '../../hooks/usePageSize';

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

  const { sizeScale, setSizeScale, resetSize, minScale, maxScale } = usePageSize(currentPageConfig.id);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    if (!settingsOpen) {
      setMenuStyle({});
      return undefined;
    }

    const updatePosition = () => {
      if (settingsButtonRef.current) {
        const rect = settingsButtonRef.current.getBoundingClientRect();
        setMenuStyle({
          width: '280px',
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
        });
      }
    };

    updatePosition();
    const timer = setTimeout(updatePosition, 10);

    const handleClickOutside = (event) => {
      if (settingsMenuRef.current?.contains(event.target)) return;
      if (settingsButtonRef.current?.contains(event.target)) return;
      setSettingsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [settingsOpen]);

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
    <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 w-full bg-white px-6 py-4 rounded-lg border border-slate-200/60 shadow-sm">
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

        {yearSelector || <YearSelector />}
        {user && (
          <>
            <button
              ref={settingsButtonRef}
              onClick={() => setSettingsOpen((prev) => !prev)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-transparent rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all duration-200 flex items-center gap-2"
              title="Settings"
              aria-expanded={settingsOpen}
            >
              <Settings className="w-4 h-4" />
            </button>
            {settingsOpen && createPortal(
              <div
                ref={settingsMenuRef}
                className="fixed rounded-lg border border-[#94a3b8] p-3 shadow-2xl"
                style={{ ...menuStyle, backgroundColor: 'rgba(255, 255, 255, 0.97)', zIndex: 999999 }}
              >
                <div className="flex flex-col" style={{ gap: '8px' }}>
                  {/* Page Size Section - Compact slider */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600 w-12">{currentPageConfig.name}</span>
                    <input
                      type="range"
                      min={minScale * 100}
                      max={maxScale * 100}
                      step={10}
                      value={Math.round(sizeScale * 100)}
                      onChange={(e) => setSizeScale(parseInt(e.target.value, 10) / 100)}
                      className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#065f46]"
                      style={{ minWidth: '100px' }}
                    />
                    <span className="text-xs font-semibold text-[#065f46] w-10 text-right">
                      {Math.round(sizeScale * 100)}%
                    </span>
                    <button
                      onClick={resetSize}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      title="Reset to 100%"
                    >
                      ↺
                    </button>
                  </div>

                  {/* Account Settings Link */}
                  <div className="pt-2 border-t border-[#e2e8f0]">
                    <button
                      onClick={() => {
                        setSettingsOpen(false);
                        navigate('/settings');
                      }}
                      className="w-full px-3 py-1.5 rounded text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors text-left"
                    >
                      Account Settings
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
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
