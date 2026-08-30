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
import usePageSize from '../../hooks/usePageSize';

// Map routes to page identifiers and display names
const PAGE_CONFIG = {
  '/staging': { id: 'goal', name: 'Goal' },
  '/tactics': { id: 'plan', name: 'Plan' },
  '/': { id: 'system', name: 'System' },
};

// Nav background: grid + gradient orbs, seamlessly continues the page background
// Function, not a module const: the grid SVG layer bakes in the resolved
// theme colour, so it must recompute per render (useThemeVersion).
const navBgStyle = () => ({
  backgroundColor: '#ffffff',
  backgroundImage: [
    // Grid lines as an SVG tile rather than 1px gradient hard-stops:
    // gradient hairlines round to zero device pixels and vanish when the
    // effective DPR drops below 1 (browser zoom < 100% on a 1x monitor).
    // The SVG stroke antialiases instead, so the grid survives any zoom.
    gridSvgLayer(0.15),
  ].join(','),
  backgroundSize: '32px 32px',
  backgroundPosition: '-1px -1px',
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
  // Nav bar scale, set from the gear panel's Nav bar section
  const { sizeScale: navScale } = usePageSize('nav');
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, user } = useAuth();
  const { draftYear, currentYear, activeYear, switchToYear, isCurrentYearArchived } = useYear();

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

  const isViewingDraft = draftYear && currentYear === draftYear.yearNumber;

  const handleDraftToggle = () => {
    if (!draftYear) return;
    if (isViewingDraft) {
      // Switch back to the active year, stay on the same page
      if (activeYear) switchToYear(activeYear.yearNumber);
    } else {
      switchToYear(draftYear.yearNumber);
    }
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
        // CSS zoom (not transform) so the bar keeps its place in layout flow
        // and panel-position measurements of [data-nav] stay correct.
        zoom: navScale,
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

        {/* Draft pill — only when a draft exists; toggles between draft and active year */}
        {user && draftYear && (
          <button
            type="button"
            onClick={handleDraftToggle}
            title={isViewingDraft ? `Back to Year ${activeYear?.yearNumber ?? ''}` : `View draft Year ${draftYear.yearNumber}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              alignSelf: 'stretch',
              fontFamily: FONT,
              fontSize: 13, fontWeight: 600,
              padding: '4px 16px',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              background: isViewingDraft
                ? 'color-mix(in srgb, var(--th-sel) 78%, black)'
                : 'var(--th-sel)',
              color: '#ffffff',
              boxShadow: isViewingDraft
                ? 'inset 0 0 0 2px rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.06)'
                : '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'background 0.15s, box-shadow 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {isViewingDraft ? 'Viewing Draft Year' : 'Open Draft Year'}
          </button>
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
                const isActive = currentPath === item.path;
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
