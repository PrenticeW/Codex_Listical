import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import YearSelector from '../YearSelector';
import { useAuth } from '../../contexts/AuthContext';
import usePageSize from '../../hooks/usePageSize';

// Map routes to page identifiers and display names
const PAGE_CONFIG = {
  '/staging': { id: 'goal', name: 'Goal' },
  '/tactics': { id: 'plan', name: 'Plan' },
  '/': { id: 'system', name: 'System' },
};

export default function NavigationBar({
  listicalButton = null,
  yearSelector = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, user } = useAuth();

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

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 shrink-0 w-full bg-white px-6 py-4 rounded-lg border border-slate-200/60 shadow-sm">
      <div className="flex items-center gap-4">
        {listicalButton ? <div className="relative z-10">{listicalButton}</div> : null}
        <div className="flex items-center gap-2">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={buttonClasses(currentPath === item.path)}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
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
