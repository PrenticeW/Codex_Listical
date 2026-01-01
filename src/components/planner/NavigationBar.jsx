import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import YearSelector from '../YearSelector';
import { useAuth } from '../../contexts/AuthContext';

export default function NavigationBar({
  listicalButton = null,
  yearSelector = null,
  archiveButton = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const { logout, user } = useAuth();

  const navItems = [
    { label: 'Goals', path: '/staging' },
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
        {listicalButton ? <div className="relative">{listicalButton}</div> : null}
      </div>

      <div className="flex items-center gap-4">
        {archiveButton}
        {yearSelector || <YearSelector />}
        {user && (
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-transparent rounded-lg hover:bg-slate-100 hover:text-slate-900 transition-all duration-200 flex items-center gap-2"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
