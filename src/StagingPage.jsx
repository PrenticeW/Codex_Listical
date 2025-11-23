import React, { useEffect, useRef, useState } from 'react';
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

const normalizeItems = (list) =>
  Array.isArray(list)
    ? list.map((item) => ({
        ...item,
        reasons: Array.isArray(item.reasons) ? item.reasons : [],
        outcomes: Array.isArray(item.outcomes) ? item.outcomes : [],
        showOutcomes: Boolean(item.showOutcomes),
        showOutcomeQuestion: Boolean(item.showOutcomeQuestion),
      }))
    : [];

const loadState = () => {
  if (typeof window === 'undefined') return { shortlist: [], archived: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { shortlist: [], archived: [] };
    const parsed = JSON.parse(raw);
    return {
      shortlist: normalizeItems(parsed?.shortlist),
      archived: normalizeItems(parsed?.archived),
    };
  } catch (error) {
    console.error('Failed to read staging shortlist', error);
    return { shortlist: [], archived: [] };
  }
};

const saveState = (payload) => {
  if (typeof window === 'undefined') return;
  try {
    const serialized = {
      shortlist: normalizeItems(payload.shortlist),
      archived: normalizeItems(payload.archived),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  } catch (error) {
    console.error('Failed to save staging shortlist', error);
  }
};

export default function StagingPage({ currentPath = '/staging', onNavigate = () => {} }) {
  const [inputValue, setInputValue] = useState('');
  const [{ shortlist, archived }, setState] = useState(() => loadState());
  const [reasonDrafts, setReasonDrafts] = useState({});
  const reasonInputRefs = useRef(new Map());
  const [pendingReasonFocus, setPendingReasonFocus] = useState(null);
  const [outcomeDrafts, setOutcomeDrafts] = useState({});
  const outcomeInputRefs = useRef(new Map());
  const [pendingOutcomeFocus, setPendingOutcomeFocus] = useState(null);
  const stepInputRefs = useRef(new Map());
  const [pendingStepFocus, setPendingStepFocus] = useState(null);
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

  useEffect(() => {
    if (!pendingReasonFocus) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const { itemId, index } = pendingReasonFocus;
      const refs = reasonInputRefs.current.get(itemId);
      const target = refs?.[index];
      if (target) {
        target.focus();
        if (typeof target.setSelectionRange === 'function') {
          const caret = target.value.length;
          target.setSelectionRange(caret, caret);
        }
        setPendingReasonFocus(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingReasonFocus, shortlist]);

  useEffect(() => {
    if (!pendingOutcomeFocus) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const { itemId, index } = pendingOutcomeFocus;
      const refs = outcomeInputRefs.current.get(itemId);
      const target = refs?.[index];
      if (target) {
        target.focus();
        if (typeof target.setSelectionRange === 'function') {
          const caret = target.value.length;
          target.setSelectionRange(caret, caret);
        }
        setPendingOutcomeFocus(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingOutcomeFocus, shortlist]);

  useEffect(() => {
    if (!pendingStepFocus) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const { itemId, index } = pendingStepFocus;
      const refs = stepInputRefs.current.get(itemId);
      const target = refs?.[index];
      if (target) {
        target.focus();
        if (typeof target.setSelectionRange === 'function') {
          const caret = target.value.length;
          target.setSelectionRange(caret, caret);
        }
        setPendingStepFocus(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingStepFocus, shortlist]);

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
              reasons: [],
              outcomes: [],
              showOutcomes: false,
              showOutcomeQuestion: false,
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
    setReasonDrafts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    reasonInputRefs.current.delete(id);
    setPendingReasonFocus((prev) => (prev?.itemId === id ? null : prev));
    setOutcomeDrafts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    outcomeInputRefs.current.delete(id);
    setPendingOutcomeFocus((prev) => (prev?.itemId === id ? null : prev));
    stepInputRefs.current.delete(id);
    setPendingStepFocus((prev) => (prev?.itemId === id ? null : prev));
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
    setReasonDrafts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    reasonInputRefs.current.delete(id);
    setPendingReasonFocus((prev) => (prev?.itemId === id ? null : prev));
    setOutcomeDrafts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    outcomeInputRefs.current.delete(id);
    setPendingOutcomeFocus((prev) => (prev?.itemId === id ? null : prev));
    stepInputRefs.current.delete(id);
    setPendingStepFocus((prev) => (prev?.itemId === id ? null : prev));
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

  const handleReasonDraftChange = (itemId, value) => {
    setReasonDrafts((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleOutcomeDraftChange = (itemId, value) => {
    setOutcomeDrafts((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleReasonSubmit = (itemId) => {
    const draft = (reasonDrafts[itemId] ?? '').trim();
    if (!draft) return;
    let nextReasonIndex = null;
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) =>
        item.id === itemId
          ? {
              ...item,
              reasons: (() => {
                const reasons = Array.isArray(item.reasons) ? item.reasons : [];
                const updated = [...reasons, draft];
                nextReasonIndex = updated.length - 1;
                return updated;
              })(),
            }
          : item
      ),
    }));
    setReasonDrafts((prev) => ({
      ...prev,
      [itemId]: '',
    }));
    if (nextReasonIndex !== null) {
      setPendingReasonFocus({ itemId, index: nextReasonIndex });
    }
  };

  const handleOutcomeSubmit = (itemId) => {
    const draft = (outcomeDrafts[itemId] ?? '').trim();
    if (!draft) return;
    let nextOutcomeIndex = null;
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) =>
        item.id === itemId
          ? {
              ...item,
              showOutcomes: true,
              outcomes: (() => {
                const outcomes = Array.isArray(item.outcomes) ? item.outcomes : [];
                const updated = [...outcomes, draft];
                nextOutcomeIndex = updated.length - 1;
                return updated;
              })(),
            }
          : item
      ),
    }));
    setOutcomeDrafts((prev) => ({
      ...prev,
      [itemId]: '',
    }));
    if (nextOutcomeIndex !== null) {
      setPendingOutcomeFocus({ itemId, index: nextOutcomeIndex });
    }
  };

  const handleReasonKeyDown = (event, itemId) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleReasonSubmit(itemId);
  };

  const handleOutcomeKeyDown = (event, itemId) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    handleOutcomeSubmit(itemId);
  };

  const handleReasonRowKeyDown = (event, itemId, reasonIndex) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextReasons = [...(Array.isArray(item.reasons) ? item.reasons : [])];
        nextReasons.splice(reasonIndex + 1, 0, '');
        return { ...item, reasons: nextReasons };
      }),
    }));
    setPendingReasonFocus({ itemId, index: reasonIndex + 1 });
  };

  const handleOutcomeRowKeyDown = (event, itemId, outcomeIndex) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextOutcomes = [...(Array.isArray(item.outcomes) ? item.outcomes : [])];
        nextOutcomes.splice(outcomeIndex + 1, 0, '');
        return { ...item, outcomes: nextOutcomes };
      }),
    }));
    setPendingOutcomeFocus({ itemId, index: outcomeIndex + 1 });
  };

  const handleReasonChange = (itemId, reasonIndex, value) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextReasons = [...(Array.isArray(item.reasons) ? item.reasons : [])];
        nextReasons[reasonIndex] = value;
        return { ...item, reasons: nextReasons };
      }),
    }));
  };

  const handleOutcomeChange = (itemId, outcomeIndex, value) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextOutcomes = [...(Array.isArray(item.outcomes) ? item.outcomes : [])];
        nextOutcomes[outcomeIndex] = value;
        return { ...item, outcomes: nextOutcomes };
      }),
    }));
  };

  const removeReason = (itemId, reasonIndex) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextReasons = [...(Array.isArray(item.reasons) ? item.reasons : [])];
        nextReasons.splice(reasonIndex, 1);
        return { ...item, reasons: nextReasons };
      }),
    }));
  };

  const removeOutcome = (itemId, outcomeIndex) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextOutcomes = [...(Array.isArray(item.outcomes) ? item.outcomes : [])];
        nextOutcomes.splice(outcomeIndex, 1);
        return { ...item, outcomes: nextOutcomes };
      }),
    }));
  };

  const handleStartNextStep = (itemId) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) =>
        item.id === itemId ? { ...item, showOutcomes: true } : item
      ),
    }));
  };

  const handleOutcomeNextStep = (itemId) => {
    let shouldInitStep = false;
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) =>
        item.id === itemId
          ? {
              ...item,
              showOutcomeQuestion: true,
              steps: (() => {
                const existing = Array.isArray(item.steps) ? item.steps : [];
                if (existing.length === 0) {
                  shouldInitStep = true;
                  return [''];
                }
                return existing;
              })(),
            }
          : item
      ),
    }));
    if (shouldInitStep) {
      setPendingStepFocus({ itemId, index: 0 });
    }
  };

  const registerReasonInputRef = (itemId, reasonIndex, node) => {
    if (!reasonInputRefs.current.has(itemId)) {
      reasonInputRefs.current.set(itemId, []);
    }
    const entries = reasonInputRefs.current.get(itemId);
    entries[reasonIndex] = node ?? null;
    if (
      node &&
      pendingReasonFocus &&
      pendingReasonFocus.itemId === itemId &&
      pendingReasonFocus.index === reasonIndex
    ) {
      node.focus();
      if (typeof node.setSelectionRange === 'function') {
        const caret = node.value.length;
        node.setSelectionRange(caret, caret);
      }
      setPendingReasonFocus(null);
    }
  };

  const registerOutcomeInputRef = (itemId, outcomeIndex, node) => {
    if (!outcomeInputRefs.current.has(itemId)) {
      outcomeInputRefs.current.set(itemId, []);
    }
    const entries = outcomeInputRefs.current.get(itemId);
    entries[outcomeIndex] = node ?? null;
    if (
      node &&
      pendingOutcomeFocus &&
      pendingOutcomeFocus.itemId === itemId &&
      pendingOutcomeFocus.index === outcomeIndex
    ) {
      node.focus();
      if (typeof node.setSelectionRange === 'function') {
        const caret = node.value.length;
        node.setSelectionRange(caret, caret);
      }
      setPendingOutcomeFocus(null);
    }
  };

  const handleStepChange = (itemId, stepIndex, value) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextSteps = [...(Array.isArray(item.steps) ? item.steps : [''])];
        nextSteps[stepIndex] = value;
        return { ...item, steps: nextSteps };
      }),
    }));
  };

  const handleStepRowKeyDown = (event, itemId, stepIndex) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextSteps = [...(Array.isArray(item.steps) ? item.steps : [])];
        nextSteps.splice(stepIndex + 1, 0, '');
        return { ...item, steps: nextSteps };
      }),
    }));
    setPendingStepFocus({ itemId, index: stepIndex + 1 });
  };

  const removeStep = (itemId, stepIndex) => {
    setState((prev) => ({
      ...prev,
      shortlist: prev.shortlist.map((item) => {
        if (item.id !== itemId) return item;
        const nextSteps = [...(Array.isArray(item.steps) ? item.steps : [])];
        if (nextSteps.length <= 1) {
          nextSteps[0] = '';
        } else {
          nextSteps.splice(stepIndex, 1);
        }
        return { ...item, steps: nextSteps };
      }),
    }));
  };

  const registerStepInputRef = (itemId, stepIndex, node) => {
    if (!stepInputRefs.current.has(itemId)) {
      stepInputRefs.current.set(itemId, []);
    }
    const entries = stepInputRefs.current.get(itemId);
    entries[stepIndex] = node ?? null;
    if (
      node &&
      pendingStepFocus &&
      pendingStepFocus.itemId === itemId &&
      pendingStepFocus.index === stepIndex
    ) {
      node.focus();
      if (typeof node.setSelectionRange === 'function') {
        const caret = node.value.length;
        node.setSelectionRange(caret, caret);
      }
      setPendingStepFocus(null);
    }
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
                        {item.projectName || item.text}
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
                          value={reasonDrafts[item.id] ?? ''}
                          onChange={(e) => handleReasonDraftChange(item.id, e.target.value)}
                          onKeyDown={(e) => handleReasonKeyDown(e, item.id)}
                          className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          placeholder="Why do you want to start this?"
                        />
                        {(item.reasons ?? []).map((reason, index) => (
                          <div
                            key={`${item.id}-reason-${index}`}
                            className="grid items-center gap-3 rounded border border-[#ced3d0] bg-white p-3 shadow-inner"
                            style={{ gridTemplateColumns: '23ch 1fr auto' }}
                          >
                            <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{`Reason ${index + 1}`}</span>
                            <input
                              type="text"
                              value={reason}
                              onChange={(e) => handleReasonChange(item.id, index, e.target.value)}
                              onKeyDown={(e) => handleReasonRowKeyDown(e, item.id, index)}
                              ref={(node) => registerReasonInputRef(item.id, index, node)}
                              className="rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            />
                            <button
                              type="button"
                              className="text-slate-500 hover:text-slate-900"
                              aria-label={`Delete Reason ${index + 1}`}
                              onClick={() => removeReason(item.id, index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {(item.reasons?.length ?? 0) > 0 && !item.showOutcomes ? (
                          <div className="pt-2">
                            <button
                              type="button"
                              className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6]"
                              onClick={() => handleStartNextStep(item.id)}
                            >
                              Next Step
                            </button>
                          </div>
                        ) : null}
                        {item.showOutcomes ? (
                          <div className="space-y-3 pt-3 border-t border-dashed border-[#ced3d0] mt-3">
                            <input
                              type="text"
                              value={outcomeDrafts[item.id] ?? ''}
                              onChange={(e) => handleOutcomeDraftChange(item.id, e.target.value)}
                              onKeyDown={(e) => handleOutcomeKeyDown(e, item.id)}
                              className="w-full rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              placeholder="What needs to be true in order for your needs to be met?"
                            />
                            {(item.outcomes ?? []).map((outcome, index) => (
                              <div
                                key={`${item.id}-outcome-${index}`}
                                className="grid items-center gap-3 rounded border border-[#ced3d0] bg-white p-3 shadow-inner"
                                style={{ gridTemplateColumns: '23ch 1fr auto' }}
                              >
                                <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{`Measurable Outcome ${index + 1}`}</span>
                                <input
                                  type="text"
                                  value={outcome}
                                  onChange={(e) => handleOutcomeChange(item.id, index, e.target.value)}
                                  onKeyDown={(e) => handleOutcomeRowKeyDown(e, item.id, index)}
                                  ref={(node) => registerOutcomeInputRef(item.id, index, node)}
                                  className="rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                />
                                <button
                                  type="button"
                                  className="text-slate-500 hover:text-slate-900"
                                  aria-label={`Delete Measurable Outcome ${index + 1}`}
                                  onClick={() => removeOutcome(item.id, index)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {item.showOutcomeQuestion ? (
                              <div className="space-y-2 rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm text-slate-800 shadow-inner">
                                <div className="font-semibold">
                                  What needs to be true in order for the outcomes to happen?
                                </div>
                                {item.outcomes?.length ? (
                                  <div className="rounded border border-[#ced3d0] bg-[#f9fafb] px-3 py-2 text-sm text-slate-800 shadow-inner">
                                    <span className="font-semibold">Measurable Outcome 1:</span>
                                    <span className="ml-2">{item.outcomes[0]}</span>
                                  </div>
                                ) : null}
                                {Array.isArray(item.steps) && item.steps.length ? (
                                  <div className="space-y-2 pt-1">
                                    {item.steps.map((stepValue, index) => (
                                      <div
                                        key={`${item.id}-step-${index}`}
                                        className="grid items-center gap-3 rounded border border-[#ced3d0] bg-white p-3 shadow-inner"
                                        style={{ gridTemplateColumns: '23ch 1fr auto' }}
                                      >
                                        <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{`Step ${index + 1}`}</span>
                                        <input
                                          type="text"
                                          value={stepValue}
                                          onChange={(e) => handleStepChange(item.id, index, e.target.value)}
                                          onKeyDown={(e) => handleStepRowKeyDown(e, item.id, index)}
                                          ref={(node) => registerStepInputRef(item.id, index, node)}
                                          className="rounded border border-[#ced3d0] px-3 py-2 text-sm text-slate-800 shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                        />
                                        <button
                                          type="button"
                                          className="text-slate-500 hover:text-slate-900"
                                          aria-label={`Delete Step ${index + 1}`}
                                          onClick={() => removeStep(item.id, index)}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="pt-2">
                                <button
                                  type="button"
                                  className="rounded border border-[#ced3d0] bg-white px-3 py-2 text-sm font-semibold text-[#065f46] shadow-sm transition hover:bg-[#f2fdf6]"
                                  onClick={() => handleOutcomeNextStep(item.id)}
                                >
                                  Next Step
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
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
