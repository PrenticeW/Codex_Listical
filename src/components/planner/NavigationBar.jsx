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

// Nav background: grid + gradient orbs, seamlessly continues the page background
const NAV_BG_STYLE = {
  backgroundColor: '#ffffff',
  backgroundImage: [
    'radial-gradient(ellipse 80% 60% at 105% -10%, rgba(130,155,210,0.45) 0%, transparent 62%)',
    'radial-gradient(ellipse 60% 45% at -5% 110%, rgba(130,155,210,0.28) 0%, transparent 58%)',
    // Grid lines as an SVG tile rather than 1px gradient hard-stops:
    // gradient hairlines round to zero device pixels and vanish when the
    // effective DPR drops below 1 (browser zoom < 100% on a 1x monitor).
    // The SVG stroke antialiases instead, so the grid survives any zoom.
    'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27%3E%3Cpath d=%27M0 0.5 H32 M0.5 0 V32%27 stroke=%27rgba(130,155,210,0.5)%27 stroke-width=%271%27/%3E%3C/svg%3E")',
  ].join(','),
  backgroundSize: '100% 100%, 100% 100%, 32px 32px',
  backgroundPosition: '0 0, 0 0, -1px -1px',
  backgroundAttachment: 'fixed',
  borderBottom: '1px solid rgba(130,155,210,0.3)',
};

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function NavigationBar({
  listicalButton = null,
  actionButton = null,
}) {
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
        ...NAV_BG_STYLE,
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
        <span style={{ fontFamily: 'var(--font-wordmark)', fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1F1F1F' }}>
          Tacular
        </span>
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
            <div style={{ width: 1, height: 20, background: 'rgba(130,155,210,0.4)' }} />
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
            background: '#8BA8D8',
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
