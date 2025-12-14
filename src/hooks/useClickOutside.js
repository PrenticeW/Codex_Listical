import { useEffect } from 'react';
import isBrowserEnvironment from '../utils/isBrowserEnvironment';

/**
 * Custom hook to handle click-outside and escape key events for dropdown menus
 *
 * @param {Object} params
 * @param {boolean} params.isOpen - Whether the menu is open
 * @param {React.RefObject} params.menuRef - Ref to the menu element
 * @param {React.RefObject} params.buttonRef - Ref to the button that triggers the menu
 * @param {Function} params.onClose - Callback to close the menu
 */
export default function useClickOutside({ isOpen, menuRef, buttonRef, onClose }) {
  useEffect(() => {
    if (!isOpen || !isBrowserEnvironment()) return undefined;

    const handleClickOutside = (event) => {
      const menuNode = menuRef.current;
      const buttonNode = buttonRef.current;

      // Don't close if clicking inside the menu or button
      if (menuNode && menuNode.contains(event.target)) return;
      if (buttonNode && buttonNode.contains(event.target)) return;

      onClose();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, menuRef, buttonRef, onClose]);
}
