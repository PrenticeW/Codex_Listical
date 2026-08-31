/**
 * ChipEditorView — shared chip editor (name + June palette + custom HSB).
 * Extracted verbatim from PlanPanel.jsx for reuse by the Manage Statuses
 * panel (docs/STATUS_MANAGER_SPEC.md). Props unchanged:
 *   editor      { name, colour, ... } | null  — edit target; reseeds state
 *   onBack      () => void
 *   onConfirm   ({ ...editor, name, colour }) => void   (see original)
 *   viewWidth   number
 *   showBack    boolean (default true) — the statuses panel renders its own
 *               BackBtn row in the sub-panel chrome, so it hides this one.
 *   nameLocked  boolean (default false) — locked built-in statuses cannot be
 *               renamed; the name field renders read-only.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CHIP_EDITOR_GROUPS,
  chipEditorIsActiveShade,
  chipEditorParseToHsb,
  chipEditorHsbToHex,
  chipContrastColour,
} from '../utils/chipEditorColours';
import PanelLockButton from './PanelLockButton';
import useConfirmKeys from '../hooks/useConfirmKeys';

const C = { bg: '#fff', borderLight: '#f0f0ed' };
const DEFAULT_VIEW_WIDTH = 306;

function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: '#fff', border: '1px solid #e8e8e4', borderRadius: 8,
        padding: '6px 11px', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 500, color: 'var(--brand-deep)',
        boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
        <path d="M5.5 1.5L2.5 4.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  );
}

export default function ChipEditorView({ editor, onBack, onConfirm, viewWidth = DEFAULT_VIEW_WIDTH, showBack = true, nameLocked = false }) {
  const [name, setName] = useState(editor?.name ?? '');
  const [colour, setColour] = useState(editor?.colour ?? '#8a7fd6');
  const [customOpen, setCustomOpen] = useState(false);
  const [hsb, setHsb] = useState({ h: 0, s: 1, b: 1 });
  const sbRef = useRef(null);
  const hueRef = useRef(null);
  const nameInputRef = useRef(null);

  // Re-seed local state whenever a new edit target arrives
  useEffect(() => {
    setName(editor?.name ?? '');
    setColour(editor?.colour ?? '#8a7fd6');
    setCustomOpen(false);
  }, [editor]);

  // Focus the name input WITHOUT scrolling. A plain autoFocus makes the
  // browser side-scroll the tray's overflow:hidden slide track to reveal the
  // input while this view is still in the off-screen slot — the offset then
  // sticks and blanks the whole panel. preventScroll avoids that entirely.
  useEffect(() => {
    if (editor) nameInputRef.current?.focus({ preventScroll: true });
  }, [editor]);

  const eyedropper = useCallback(async () => {
    if (typeof window === 'undefined' || !('EyeDropper' in window)) return;
    try {
      const result = await new window.EyeDropper().open();
      setColour(result.sRGBHex);
      setHsb(chipEditorParseToHsb(result.sRGBHex));
    } catch { /* cancelled */ }
  }, []);
  const toggleCustom = useCallback(() => {
    setCustomOpen((open) => {
      const next = !open;
      if (next) setHsb(chipEditorParseToHsb(colour));
      return next;
    });
  }, [colour]);
  const updateSb = useCallback((event) => {
    const canvas = sbRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const b = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    setHsb((prev) => {
      const next = { ...prev, s, b };
      setColour(chipEditorHsbToHex(next.h, next.s, next.b));
      return next;
    });
  }, []);
  const updateHue = useCallback((event) => {
    const track = hueRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const h = Math.max(0, Math.min(360, ((event.clientX - rect.left) / rect.width) * 360));
    setHsb((prev) => {
      const next = { ...prev, h };
      setColour(chipEditorHsbToHex(next.h, next.s, next.b));
      return next;
    });
  }, []);
  // Redraw the saturation/brightness canvas whenever the mixer is open or hue changes.
  useEffect(() => {
    if (!customOpen) return;
    const canvas = sbRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    ctx.fillStyle = `hsl(${hsb.h}, 100%, 50%)`;
    ctx.fillRect(0, 0, w, h);
    const whiteGradient = ctx.createLinearGradient(0, 0, w, 0);
    whiteGradient.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = whiteGradient;
    ctx.fillRect(0, 0, w, h);
    const blackGradient = ctx.createLinearGradient(0, 0, 0, h);
    blackGradient.addColorStop(0, 'rgba(0,0,0,0)');
    blackGradient.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = blackGradient;
    ctx.fillRect(0, 0, w, h);
  }, [customOpen, hsb.h]);

  const handleConfirm = useCallback(() => {
    if (!editor) { onBack(); return; }
    onConfirm({ kind: editor.kind, id: editor.id ?? null, chipId: editor.chipId ?? null, name, colour, isNew: editor.isNew ?? false, targetCell: editor.targetCell ?? null });
  }, [editor, name, colour, onConfirm, onBack]);
  // The name input handles its own Enter/Escape; this covers focus anywhere else in the editor.
  useConfirmKeys(true, { onConfirm: handleConfirm, onCancel: onBack, skipInputs: true });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: viewWidth, flexShrink: 0, minHeight: 0 }}>
      {/* Header — matches ColourView */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 22px 10px', borderBottom: `1px solid ${C.borderLight}`,
        flexShrink: 0, background: C.bg,
      }}>
        {showBack && <BackBtn onClick={onBack} />}
        <PanelLockButton style={{ marginLeft: 'auto' }} />
      </div>

      {/* Scrollable body */}
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '10px 22px 16px' }}>
        <div
          style={{ marginBottom:10, display:'flex', width:'100%', alignItems:'center', justifyContent:'center', borderRadius:4, padding:'8px 12px', fontFamily:"'DM Sans',-apple-system,sans-serif", fontSize:'calc(11px * var(--pz))', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', minHeight:32, background: colour, color: chipContrastColour(colour) }}
        >
          {name || '\u00A0'}
        </div>

        <div style={{ fontSize:'calc(9px * var(--pz))', fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--brand-ink)', fontFamily:"'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace", borderBottom:'1px solid var(--brand-bd)', paddingBottom:3, marginBottom:6 }}>Name</div>
        <input
          type="text"
          ref={nameInputRef}
          value={name}
          readOnly={nameLocked}
          onChange={(e) => { if (!nameLocked) setName(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onBack(); }
          }}
          style={{ width:'100%', border:'1px solid #e8e8e4', borderRadius:4, padding:'5px 8px', fontFamily:"'DM Sans',-apple-system,sans-serif", fontSize:'calc(11px * var(--pz))', fontWeight:700, textTransform:'uppercase', color:'#1A1A1A', outline:'none', boxSizing:'border-box', background:'#fff', marginBottom:10, transition:'border-color .15s' }}
          onFocus={e=>e.target.style.borderColor='var(--brand)'}
          onBlur={e=>e.target.style.borderColor='#e8e8e4'}
        />

        <div style={{ fontSize:'calc(9px * var(--pz))', fontWeight:700, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--brand-ink)', fontFamily:"'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace", borderBottom:'1px solid var(--brand-bd)', paddingBottom:3, marginBottom:6 }}>Colour</div>
        <div style={{ marginBottom:8 }}>
          {CHIP_EDITOR_GROUPS.map(({ label: groupLabel, families }) => (
            <div key={groupLabel} style={{ marginBottom:4 }}>
              <div style={{ fontSize:'calc(8px * var(--pz))', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--brand-ink)', marginBottom:3, fontFamily:"'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace" }}>{groupLabel}</div>
              {families.map(({ name: familyName, shades }) => (
                <div key={familyName} style={{ display:'flex', gap:2, marginBottom:2 }}>
                  {shades.map(([h, s, l], idx) => {
                    const bg = `hsl(${h}, ${s}%, ${l}%)`;
                    const isActive = chipEditorIsActiveShade(h, s, l, colour);
                    const pale = l >= 95 ? { border: `1px solid ${isActive ? 'rgba(255,255,255,0.6)' : '#d0d0d0'}` } : {};
                    return (
                      <button
                        key={idx}
                        type="button"
                        title={`${familyName} ${idx + 1}`}
                        onClick={() => setColour(bg)}
                        style={{ flex:1, height:14, border: isActive ? '1.5px solid #fff' : '1px solid transparent', borderRadius:1, background:bg, cursor:'pointer', padding:0, position:'relative', boxShadow: isActive ? '0 0 0 1.5px #1a1a1a' : 'none', transition:'transform .08s', ...pale }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.12)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        {isActive && (
                          <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
                            <svg width="7" height="6" viewBox="0 0 9 7" fill="none"><path d="M1 3.5l2 2L8 1" stroke={l < 50 ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.7)'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── Custom colour mixer ─────────────────────────────── */}
        <div style={{ borderTop:'1px solid var(--brand-bd)', paddingTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ flex:1, fontSize:'calc(8px * var(--pz))', fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--brand-ink)', fontFamily:"'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace" }}>Custom</div>
            <button
              type="button"
              title="Pick colour from screen"
              onClick={eyedropper}
              style={{ width:24, height:22, borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', background:'#f7f7f5', border:'1px solid #e0e0e0', cursor:'pointer', color:'#b0b0b0', flexShrink:0, transition:'color .15s,border-color .15s,background .15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.color='#333'; e.currentTarget.style.borderColor='#aaa'; e.currentTarget.style.background='#ececea'; }}
              onMouseLeave={e=>{ e.currentTarget.style.color='#b0b0b0'; e.currentTarget.style.borderColor='#e0e0e0'; e.currentTarget.style.background='#f7f7f5'; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
              </svg>
            </button>
            <button
              type="button"
              title="Mix a custom colour"
              onClick={toggleCustom}
              style={{ width:24, height:22, borderRadius:2, display:'flex', alignItems:'center', justifyContent:'center', background: customOpen ? 'var(--brand-hover-bg)' : '#f7f7f5', border: customOpen ? '1px solid var(--brand-hover-bd)' : '1px solid #e0e0e0', cursor:'pointer', color: customOpen ? 'var(--brand-ink)' : '#b0b0b0', flexShrink:0, transition:'color .15s,border-color .15s,background .15s' }}
              onMouseEnter={e=>{ if(!customOpen){ e.currentTarget.style.color='#333'; e.currentTarget.style.borderColor='#aaa'; e.currentTarget.style.background='#ececea'; } }}
              onMouseLeave={e=>{ if(!customOpen){ e.currentTarget.style.color='#b0b0b0'; e.currentTarget.style.borderColor='#e0e0e0'; e.currentTarget.style.background='#f7f7f5'; } }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 007.78 7.78L19 11z"/><path d="M20 23a2 2 0 001.4-3.4L16 14"/><line x1="3.5" y1="11.5" x2="13" y2="2"/>
              </svg>
            </button>
          </div>

          {customOpen ? (
            <>
              <div
                style={{ position:'relative', borderRadius:4, overflow:'hidden', cursor:'crosshair', touchAction:'none', marginTop:8 }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updateSb(e); }}
                onPointerMove={(e) => { if (e.buttons) updateSb(e); }}
              >
                <canvas ref={sbRef} width={220} height={96} style={{ display:'block', width:'100%', height:96 }} />
                <div
                  style={{
                    position:'absolute',
                    left:`${hsb.s * 100}%`,
                    top:`${(1 - hsb.b) * 100}%`,
                    transform:'translate(-50%,-50%)',
                    width:10, height:10, borderRadius:'50%',
                    border:'2px solid #fff',
                    boxShadow:'0 0 0 1px rgba(0,0,0,.3)',
                    pointerEvents:'none',
                    background: colour,
                  }}
                />
              </div>
              <div
                ref={hueRef}
                style={{ height:10, borderRadius:5, cursor:'pointer', position:'relative', touchAction:'none', marginTop:8, background:'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)' }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updateHue(e); }}
                onPointerMove={(e) => { if (e.buttons) updateHue(e); }}
              >
                <div
                  style={{
                    position:'absolute',
                    left:`${(hsb.h / 360) * 100}%`,
                    top:'50%',
                    transform:'translate(-50%,-50%)',
                    width:16, height:16, borderRadius:'50%',
                    background:`hsl(${hsb.h},100%,50%)`,
                    border:'2.5px solid #fff',
                    boxShadow:'0 0 0 1px rgba(0,0,0,.2)',
                    pointerEvents:'none',
                    boxSizing:'border-box',
                  }}
                />
              </div>
            </>
          ) : null}
        </div>

        <button
          type="button"
          title="Confirm"
          onClick={handleConfirm}
          style={{ marginTop:10, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'7px 0', background:'var(--brand-deep)', color:'#fff', border:'1px solid var(--brand-deep)', borderRadius:4, cursor:'pointer', fontFamily:"'DM Sans',-apple-system,sans-serif", fontSize:'calc(11px * var(--pz))', fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', transition:'opacity .1s' }}
          onMouseEnter={e=>e.currentTarget.style.opacity='0.85'}
          onMouseLeave={e=>e.currentTarget.style.opacity='1'}
        >
          <svg width="11" height="9" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Confirm
        </button>
      </div>
    </div>
  );
}
