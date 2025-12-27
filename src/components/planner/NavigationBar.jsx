import React from 'react';

export default function NavigationBar({ currentPath = '/', onNavigate = () => {}, listicalButton = null }) {
  const navItems = [
    { label: 'Projects', path: '/' },
    { label: 'Staging', path: '/staging' },
    { label: 'Tactics', path: '/tactics' },
  ];

  const buttonClasses = (active) =>
    `rounded border border-[#ced3d0] px-3 py-2 text-[12px] font-semibold shadow-sm transition text-black ${
      active ? 'bg-white hover:bg-white' : 'bg-[#e5e7eb] hover:bg-[#dcdfe3]'
    }`;

  return (
    <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
      <div className="flex items-center gap-2">
        {navItems.map((item) => (
          <button
            key={item.path}
            type="button"
            className={buttonClasses(currentPath === item.path)}
            onClick={() => onNavigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {listicalButton ? <div className="relative">{listicalButton}</div> : null}
    </div>
  );
}
