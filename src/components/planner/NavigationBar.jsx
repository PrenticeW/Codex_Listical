import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Settings, PanelRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useYear } from '../../contexts/YearContext';
import { useGearPanel } from '../../contexts/GearPanelContext';
import { useSystemPanel } from '../../contexts/SystemPanelContext';
import { usePlanPanel } from '../../contexts/PlanPanelContext';
import { useGoalPanel } from '../../contexts/GoalPanelContext';
import wordmark from '../../assets/brand/tacular-wordmark-black.svg';
import { gridSvgLayer, useThemeVersion } from '../../utils/themeBackground';

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

// Nav background: grid + gradient orbs, seamlessly continues the page background
// Function, not a module const: the grid SVG layer bakes in the resolved
// theme colour, so it must recompute per render (useThemeVersion).
const navBgStyle = () => ({
  backgroundColor: '#ffffff',
  backgroundImage: [
    'radial-gradient(ellipse 80% 60% at 105% -10%, color-mix(in srgb, var(--th-68) 14%, transparent) 0%, transparent 62%)',
    'radial-gradient(ellipse 60% 45% at -5% 110%, color-mix(in srgb, var(--th-68) 8%, transparent) 0%, transparent 58%)',
    // Grid lines as an SVG tile rather than 1px gradient hard-stops:
    // gradient hairlines round to zero device pixels and vanish when the
    // effective DPR drops below 1 (browser zoom < 100% on a 1x monitor).
    // The SVG stroke antialiases instead, so the grid survives any zoom.
    gridSvgLayer(0.15),
  ].join(','),
  backgroundSize: '100% 100%, 100% 100%, 32px 32px',
  backgroundPosition: '0 0, 0 0, -1px -1px',
  backgroundAttachment: 'fixed',
  borderBottom: '1px solid color-mix(in srgb, var(--th-68) 30%, transparent)',
});

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function NavigationBar({
  listicalButton = null,
  actionButton = null,
}) {
  // Recompute the nav background (grid SVG layer) on theme change
  useThemeVersion();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, user } = useAuth();
  const { draftYear, currentYear, switchToYear, isCurrentYearArchived } = useYear();

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

  const anyPanelOpen = systemPanelOpen || planPanelOpen || goalPanelOpen;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleDraftNav = (path) => {
    if (!draftYear) return;
    switchToYear(draftYear.yearNumber);
    navigate(path);
  };

  const handlePanelToggle = () => {
    if (isGoalPage) toggleGoalPanel();
    else if (isPlanPage) togglePlanPanel();
    else if (isSystemPage) toggleSystemPanel();
  };

  // Icon button base style
  const iconBtn = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    background: active ? '#1F1F1F' : '#ffffff',
    border: 'none',
    borderRadius: '999px',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background 0.15s',
  });

  const iconColor = (active) => active ? '#FAF5EB' : '#616161';

  return (
    <div
      data-nav=""
      style={{
        ...navBgStyle(),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px 10px 20px',
        fontFamily: FONT,
        position: 'relative',
        borderRadius: 12,
      }}
    >
      {/* Left: wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src={wordmark} alt="Tacular" style={{ height: 24, width: 'auto', display: 'block' }} />
        {listicalButton && <div style={{ position: 'relative' }}>{listicalButton}</div>}
      </div>

      {/* Center / right: eclipse pill + icon buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isCurrentYearArchived && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: '#b45309',
            background: '#fffbeb', border: '1px solid #fcd34d',
            borderRadius: 6, padding: '4px 10px', userSelect: 'none',
          }}>
            Archived · Read only
          </span>
        )}

        {actionButton || null}

        {/* Draft year nav — only when a draft exists */}
        {draftYear && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 1, height: 20, background: 'color-mix(in srgb, var(--th-68) 40%, transparent)' }} />
            <span style={{
              fontSize: 10, fontWeight: 700,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: '#7c3aed', fontFamily: "'IBM Plex Mono',monospace",
            }}>
              Y{draftYear.yearNumber}
            </span>
            {DRAFT_NAV_ITEMS.map((item) => {
              const isActive = currentPath === item.path && currentYear === draftYear?.yearNumber;
              return (
                <button
                  key={`draft-${item.path}`}
                  type="button"
                  onClick={() => handleDraftNav(item.path)}
                  style={{
                    fontFamily: FONT,
                    fontSize: 13, fontWeight: 600,
                    padding: '7px 18px',
                    borderRadius: '999px',
                    border: 'none',
                    cursor: 'pointer',
                    background: isActive ? '#6d28d9' : 'transparent',
                    color: isActive ? '#fff' : '#7c3aed',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Eclipse pill: year label + tab buttons */}
        {user && (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'var(--th-header)',
            borderRadius: '999px',
            padding: '4px 4px 4px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {/* Year label */}
            <span style={{
              fontFamily: FONT,
              fontSize: 13, fontWeight: 600,
              color: '#1F1F1F',
              paddingRight: 12,
              whiteSpace: 'nowrap',
            }}>
              Year {currentYear ?? 1}
            </span>
            {/* Tab buttons */}
            <div style={{
              display: 'inline-flex', gap: 3,
              background: '#ffffff',
              borderRadius: '999px',
              padding: 4,
            }}>
              {navItems.map((item) => {
                const isActive = currentPath === item.path && currentYear !== draftYear?.yearNumber;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    style={{
                      fontFamily: FONT,
                      fontSize: 13, fontWeight: 600,
                      padding: '7px 18px',
                      borderRadius: '999px',
                      border: 'none',
                      cursor: 'pointer',
                      background: isActive ? '#1F1F1F' : 'transparent',
                      color: isActive ? '#ffffff' : '#616161',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel icon button */}
        {user && (isGoalPage || isPlanPage || isSystemPage) && (
          <button
            style={iconBtn(anyPanelOpen)}
            title="Panel"
            onClick={handlePanelToggle}
          >
            <PanelRight size={17} color={iconColor(anyPanelOpen)} />
          </button>
        )}

        {/* Gear icon button */}
        {user && (
          <button
            style={iconBtn(gearPanelOpen)}
            title="Settings"
            onClick={() => {
              toggleGearPanel();
            }}
          >
            <Settings size={17} color={iconColor(gearPanelOpen)} />
          </button>
        )}
      </div>
    </div>
  );
}
