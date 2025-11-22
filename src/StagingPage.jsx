import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SquarePlus } from 'lucide-react';
import NavigationBar from './NavigationBar';

const STORAGE_KEY = 'staging-shortlist';
const COLOR_PALETTE = [
  '#8e7cc3',
  '#f6b26b',
  '#b4a7d6',
  '#93c47d',
  '#6fa8dc',
  '#76a5af',
  '#c9b4e6',
  '#a2d2a8',
];

const loadState = () => {
  if (typeof window === 'undefined') return { shortlist: [], archived: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shortlist: [], archived: [] };
    const parsed = JSON.parse(raw);
    return {
      shortlist: Array.isArray(parsed?.shortlist) ? parsed.shortlist : [],
      archived: Array.isArray(parsed?.archived) ? parsed.archived : [],
    };
  } catch (error) {
    console.error('Failed to read staging shortlist', error);
    return { shortlist: [], archived: [] };
  }
};

const saveState = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
};

export default function StagingPage({ currentPath = '/staging', onNavigate = () => {} }) {
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState(() => loadState());
  const [planModal, setPlanModal] = useState({
    open: false,
    itemId: null,
    projectName: '',
    projectNickname: '',
    color: COLOR_PALETTE[0],
  });

  useEffect(() => {
    saveState({ shortlist, archived });
  }, [shortlist, archived]);

  const handleAdd = () => {
    const text = inputValue.trim();
    if (!text) return;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setState((prev) => ({
      shortlist: [
        ...prev.shortlist,
        {
          id,
          text,
          color: null,
        },
      ],
      archived: prev.archived,
    }));
    setInputValue('');
  };

  const handleRemove = (id) => {
    setState((prev) => ({
      shortlist: prev.shortlist.filter((item) => item.id !== id),
      archived: prev.archived,
    }));
  };

  const handleArchive = (id) => {
    setState((prev) => {
      const target = prev.shortlist.find((item) => item.id === id);
      if (!target) return prev;
      return {
        shortlist: prev.shortlist.filter((item) => item.id !== id),
        archived: [...prev.archived, target],
      };
    });
  };

  const openPlanModal = (item) => {
    setPlanModal({
      open: true,
      itemId: item.id,
      projectName: item.projectName ?? item.text,
      projectNickname: item.projectNickname ?? '',
      color: item.color ?? COLOR_PALETTE[0],
    });
  };

  const closePlanModal = () => {
    setPlanModal((prev) => ({ ...prev, open: false, itemId: null }));
  };

  const applyPlanSettings = () => {
    if (!planModal.itemId) {
      closePlanModal();
      return;
    }
    setState((prev) => ({
      shortlist: prev.shortlist.map((item) =>
        item.id === planModal.itemId
          ? {
              ...item,
              color: planModal.color,
              projectName: planModal.projectName,
              projectNickname: planModal.projectNickname,
              hasPlan: true,
              expanded: false,
            }
          : item
      ),
      archived: prev.archived,
    }));
    closePlanModal();
  };

  const toggleDetails = (id) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) =>
        item.id === id ? { ...item, expanded: !item.expanded } : item
      ),
    }));
  };

  return (
    <>
      <div className="min-h-screen bg-gray-100 text-slate-800 p-4 relative">
      <NavigationBar
        currentPath={currentPath}
        onNavigate={onNavigate}
        listicalButton={
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded border border-[#ced3d0] bg-white px-3 py-2 font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6] hover:shadow-md"
          >
            <span>Listical</span>
          </button>
        }
      />
      <div className="space-y-6" style={{ marginTop: '75px' }}>
        <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm" style={{ marginBottom: '10px' }}>
          <label
            className="block font-bold text-slate-700 mb-2 tracking-wide"
            style={{ fontSize: '22px' }}
            htmlFor="staging-input"
          >
            What would you like to get done?
          </label>
          <input
            id="staging-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="w-full rounded border border-[#ced3d0] px-3 py-2 text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{ fontSize: '18px', marginTop: '10px' }}
            placeholder="Add to project shortlist and press Enter"
          />
        </div>

        <div className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm">
          {shortlist.length === 0 ? (
            <p className="text-sm text-slate-600">No items yet. Add something above to get started.</p>
          ) : (
            <div className="grid gap-[5px]">
              {shortlist.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="grid grid-cols-[36px_1fr] items-center gap-2 relative">
                    <div className="flex justify-center">
                      {item.hasPlan ? (
                        <button
                          type="button"
                          className="h-7 w-7 flex items-center justify-center rounded-full bg-white hover:bg-slate-50 border-none outline-none focus:outline-none"
                          onClick={() => toggleDetails(item.id)}
                          aria-label="Toggle plan details"
                        >
                          <SquarePlus size={16} color="#374151" />
                        </button>
                      ) : null}
                    </div>
                    <div
                      className="relative flex flex-wrap items-center justify-between gap-3 rounded border border-[#ced3d0] pr-3 py-2 shadow-inner"
                      style={{
                        backgroundColor: item.color || '#f3f4f6',
                        color: '#0f172a',
                        paddingLeft: '12px',
                      }}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        {item.text}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded border border-[#334155] bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-800 hover:bg-white"
                          onClick={() => handleRemove(item.id)}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#334155] bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-800 hover:bg-white"
                          onClick={() => openPlanModal(item)}
                        >
                          {item.hasPlan ? 'Edit' : 'Make Plan'}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-[#334155] bg-white/70 px-2 py-1 text-[12px] font-semibold text-slate-800 hover:bg-white"
                          onClick={() => handleArchive(item.id)}
                        >
                          Archive
                        </button>
                      </div>
                      {planModal.open && planModal.itemId === item.id && (
                        <div
                          className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-[#ced3d0] bg-white p-4 shadow-xl z-[9999]"
                          style={{ backgroundColor: '#ffffff' }}
                        >
                          <div className="space-y-3">
                            <div className="space-y-2">
                              <span className="text-sm font-semibold text-slate-700">Project colour</span>
                              <div className="flex flex-wrap gap-2">
                                {COLOR_PALETTE.map((color) => {
                                  const isActive = color === (planModal.color || COLOR_PALETTE[0]);
                                  return (
                                    <button
                                      key={color}
                                      type="button"
                                      className={`border ${isActive ? 'border-black ring-2 ring-black/50' : 'border-[#ced3d0]'}`}
                                      style={{
                                        backgroundColor: color,
                                        borderRadius: '9999px',
                                        height: '15px',
                                        width: '30px',
                                        padding: 0,
                                      }}
                                      onClick={() => setPlanModal((prev) => ({ ...prev, color }))}
                                      aria-label={`Select color ${color}`}
                                    ></button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-semibold text-slate-700" htmlFor="plan-name">
                                Project Name
                              </label>
                              <input
                                id="plan-name"
                                type="text"
                                value={planModal.projectName}
                                onChange={(e) =>
                                  setPlanModal((prev) => ({ ...prev, projectName: e.target.value }))
                                }
                                className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-sm font-semibold text-slate-700" htmlFor="plan-nickname">
                                Project Nickname
                              </label>
                              <input
                                id="plan-nickname"
                                type="text"
                                value={planModal.projectNickname}
                                onChange={(e) =>
                                  setPlanModal((prev) => ({ ...prev, projectNickname: e.target.value }))
                                }
                                className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                onClick={applyPlanSettings}
                              >
                                Next
                              </button>
                              <button
                                type="button"
                                className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                onClick={closePlanModal}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {item.expanded ? (
                    <div
                      className="rounded border border-[#ced3d0] bg-white p-4 shadow-sm"
                      style={{ marginLeft: '36px' }}
                    >
                      <div className="space-y-3">
                        <input
                          type="text"
                          className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          placeholder="Why do you want to start this?"
                        />
                        <input
                          type="text"
                          className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          placeholder="What do you want to be true by the end of this project?"
                        />
                        <input
                          type="text"
                          className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          placeholder="What needs to be true in order for that to happen?"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
      {planModal.open && (() => {
        const modalContent = (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-md rounded-lg border border-[#ced3d0] bg-white p-5 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Plan Project</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Project colour</span>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PALETTE.map((color) => {
                      const isActive = color === (planModal.color || COLOR_PALETTE[0]);
                      return (
                        <button
                          key={color}
                          type="button"
                          className={`h-8 w-8 rounded-full border ${isActive ? 'border-black ring-2 ring-black/50' : 'border-[#ced3d0]'}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setPlanModal((prev) => ({ ...prev, color }))}
                          aria-label={`Select color ${color}`}
                        ></button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="plan-name">
                    Project Name
                  </label>
                  <input
                    id="plan-name"
                    type="text"
                    value={planModal.projectName}
                    onChange={(e) => setPlanModal((prev) => ({ ...prev, projectName: e.target.value }))}
                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="plan-nickname">
                    Project Nickname
                  </label>
                  <input
                    id="plan-nickname"
                    type="text"
                    value={planModal.projectNickname}
                    onChange={(e) =>
                      setPlanModal((prev) => ({ ...prev, projectNickname: e.target.value }))
                    }
                    className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="rounded border border-[#ced3d0] bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={applyPlanSettings}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        );
        return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
      })()}
    </>
  );
}
