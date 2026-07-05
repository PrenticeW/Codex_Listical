import React from 'react';
import useClickOutside from '../../hooks/useClickOutside';

// ─── Shared filter menu chrome ────────────────────────────────────────────────

const PANEL_STYLE = {
  position: 'fixed',
  zIndex: 50,
  minWidth: 160,
  overflow: 'hidden',
  background: '#ffffff',
  border: '1px solid #e8e8e4',
  borderRadius: 6,
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 12px rgba(72,50,75,0.10)',
  fontSize: 12,
};

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function FilterItem({ name, isSelected, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type="button"
      onMouseDown={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', height: 26, padding: '0 10px 0 12px',
        background: isSelected ? 'var(--sel-row)' : (hovered ? 'rgba(43,89,182,0.05)' : '#ffffff'),
        fontFamily: FONT, fontSize: 12,
        fontWeight: isSelected ? 600 : 400,
        color: isSelected ? '#1F1F1F' : '#383838',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.1s',
      }}
    >
      <span>{name}</span>
      {isSelected && (
        <svg width="11" height="9" viewBox="0 0 12 10" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 5l3.5 3.5L11 1" stroke="#2B59B6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

const FilterPanel = React.memo(function FilterPanel({
  projectFilterMenu,
  projectFilterMenuRef,
  projectFilterButtonRef,
  projectNames,
  selectedProjectFilters,
  handleProjectFilterSelect,
  closeProjectFilterMenu,
  subprojectFilterMenu,
  subprojectFilterMenuRef,
  subprojectFilterButtonRef,
  subprojectNames,
  selectedSubprojectFilters,
  handleSubprojectFilterSelect,
  closeSubprojectFilterMenu,
  statusFilterMenu,
  statusFilterMenuRef,
  statusFilterButtonRef,
  statusNames,
  selectedStatusFilters,
  handleStatusFilterSelect,
  closeStatusFilterMenu,
  recurringFilterMenu,
  recurringFilterMenuRef,
  recurringFilterButtonRef,
  recurringNames,
  selectedRecurringFilters,
  handleRecurringFilterSelect,
  closeRecurringFilterMenu,
  estimateFilterMenu,
  estimateFilterMenuRef,
  estimateFilterButtonRef,
  estimateNames,
  selectedEstimateFilters,
  handleEstimateFilterSelect,
  closeEstimateFilterMenu,
}) {
  useClickOutside({ isOpen: projectFilterMenu.open,   menuRef: projectFilterMenuRef,   buttonRef: projectFilterButtonRef,   onClose: closeProjectFilterMenu });
  useClickOutside({ isOpen: subprojectFilterMenu.open, menuRef: subprojectFilterMenuRef, buttonRef: subprojectFilterButtonRef, onClose: closeSubprojectFilterMenu });
  useClickOutside({ isOpen: statusFilterMenu.open,    menuRef: statusFilterMenuRef,    buttonRef: statusFilterButtonRef,    onClose: closeStatusFilterMenu });
  useClickOutside({ isOpen: recurringFilterMenu.open, menuRef: recurringFilterMenuRef, buttonRef: recurringFilterButtonRef, onClose: closeRecurringFilterMenu });
  useClickOutside({ isOpen: estimateFilterMenu.open,  menuRef: estimateFilterMenuRef,  buttonRef: estimateFilterButtonRef,  onClose: closeEstimateFilterMenu });

  return (
    <>
      {projectFilterMenu.open && (
        <div ref={projectFilterMenuRef} style={{ ...PANEL_STYLE, top: projectFilterMenu.top, left: projectFilterMenu.left }}>
          <div style={{ maxHeight: 256, overflowY: 'auto' }}>
            {projectNames.length === 0 ? (
              <div style={{ padding: '8px 12px', color: '#888', fontFamily: FONT, fontSize: 12 }}>No projects available</div>
            ) : projectNames.map(name => (
              <FilterItem key={name} name={name} isSelected={selectedProjectFilters.has(name)} onClick={() => handleProjectFilterSelect(name)} />
            ))}
          </div>
        </div>
      )}

      {subprojectFilterMenu.open && (
        <div ref={subprojectFilterMenuRef} style={{ ...PANEL_STYLE, top: subprojectFilterMenu.top, left: subprojectFilterMenu.left }}>
          <div style={{ maxHeight: 256, overflowY: 'auto' }}>
            {subprojectNames.length === 0 ? (
              <div style={{ padding: '8px 12px', color: '#888', fontFamily: FONT, fontSize: 12 }}>No subprojects available</div>
            ) : subprojectNames.map(name => (
              <FilterItem key={name} name={name} isSelected={selectedSubprojectFilters.has(name)} onClick={() => handleSubprojectFilterSelect(name)} />
            ))}
          </div>
        </div>
      )}

      {statusFilterMenu.open && (
        <div ref={statusFilterMenuRef} style={{ ...PANEL_STYLE, top: statusFilterMenu.top, left: statusFilterMenu.left }}>
          <div style={{ maxHeight: 256, overflowY: 'auto' }}>
            {statusNames.length === 0 ? (
              <div style={{ padding: '8px 12px', color: '#888', fontFamily: FONT, fontSize: 12 }}>No statuses available</div>
            ) : statusNames.map(name => (
              <FilterItem key={name} name={name} isSelected={selectedStatusFilters.has(name)} onClick={() => handleStatusFilterSelect(name)} />
            ))}
          </div>
        </div>
      )}

      {recurringFilterMenu.open && (
        <div ref={recurringFilterMenuRef} style={{ ...PANEL_STYLE, top: recurringFilterMenu.top, left: recurringFilterMenu.left }}>
          <div style={{ maxHeight: 256, overflowY: 'auto' }}>
            {recurringNames.map(name => (
              <FilterItem key={name} name={name} isSelected={selectedRecurringFilters.has(name)} onClick={() => handleRecurringFilterSelect(name)} />
            ))}
          </div>
        </div>
      )}

      {estimateFilterMenu.open && (
        <div ref={estimateFilterMenuRef} style={{ ...PANEL_STYLE, top: estimateFilterMenu.top, left: estimateFilterMenu.left }}>
          <div style={{ maxHeight: 256, overflowY: 'auto' }}>
            {estimateNames.map(name => (
              <FilterItem key={name} name={name} isSelected={selectedEstimateFilters.has(name)} onClick={() => handleEstimateFilterSelect(name)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
});

export default FilterPanel;
