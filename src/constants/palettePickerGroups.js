/**
 * Shared palette data for the chip/theme colour pickers.
 *
 * JUNE_GROUPS is the swatch-group layout of the Goal page colour picker
 * (GoalPanel ColourView); the theme picker in GearPanel renders the same
 * groups. Moved here from GoalPanel.jsx so both can import it without a
 * cross-component export (react-refresh/only-export-components).
 * Each family: 6 shades as [h, s, l] triples, light -> dark.
 */

export const JUNE_GROUPS = [
  { label: 'Purples & Pinks', families: [
    { name: 'purple',     shades: [[272,72,76],[272,72,68],[272,72,60],[272,72,52],[272,72,44],[272,72,36]] },
    { name: 'plum',       shades: [[290,56,76],[290,58,68],[290,60,60],[290,62,52],[290,64,44],[290,66,36]] },
    { name: 'pink',       shades: [[326,72,76],[326,72,68],[326,72,60],[326,72,52],[326,72,44],[326,72,36]] },
  ]},
  { label: 'Reds', families: [
    { name: 'rose',       shades: [[348,77,76],[348,74,68],[348,70,60],[348,64,52],[348,59,44],[348,54,36]] },
    { name: 'red',        shades: [[2,72,76],[2,72,68],[2,72,60],[2,72,52],[2,72,44],[2,72,36]] },
    { name: 'scarlet',    shades: [[12,77,76],[12,72,68],[12,68,60],[12,62,52],[12,57,44],[12,52,36]] },
  ]},
  { label: 'Oranges', families: [
    { name: 'tangerine',  shades: [[22,100,76],[22,100,68],[22,100,60],[22,100,52],[22,100,44],[22,100,36]] },
    { name: 'orange',     shades: [[28,90,76],[28,90,68],[28,90,60],[28,90,52],[28,90,44],[28,90,36]] },
    { name: 'amber',      shades: [[36,80,76],[36,80,68],[36,80,60],[36,80,52],[36,80,44],[36,80,36]] },
  ]},
  { label: 'Yellows', families: [
    { name: 'gold',       shades: [[54,85,76],[54,85,68],[54,85,60],[54,85,52],[54,85,44],[54,85,36]] },
    { name: 'yellow',     shades: [[58,90,76],[58,90,68],[58,90,60],[58,90,52],[58,90,44],[58,90,36]] },
    { name: 'chartreuse', shades: [[62,85,76],[62,85,68],[62,85,60],[62,85,52],[62,85,44],[62,85,36]] },
  ]},
  { label: 'Greens', families: [
    { name: 'lime',       shades: [[82,72,76],[82,72,68],[82,72,60],[82,72,52],[82,72,44],[82,72,36]] },
    { name: 'green',      shades: [[110,72,76],[110,72,68],[110,72,60],[110,72,52],[110,72,44],[110,72,36]] },
    { name: 'sage',       shades: [[155,34,76],[155,42,68],[155,50,60],[155,58,52],[155,66,44],[155,74,36]] },
  ]},
  { label: 'Teals & Aquas', families: [
    { name: 'teal',       shades: [[173,57,76],[173,60,68],[173,62,60],[173,65,52],[173,68,44],[173,71,36]] },
    { name: 'aqua',       shades: [[188,34,76],[188,42,68],[188,50,60],[188,58,52],[188,66,44],[188,74,36]] },
    { name: 'sky',        shades: [[200,72,76],[200,72,68],[200,72,60],[200,72,52],[200,72,44],[200,72,36]] },
  ]},
  { label: 'Blues & Indigos', families: [
    { name: 'blue',       shades: [[217,56,76],[217,58,68],[217,60,60],[217,62,52],[217,64,44],[217,66,36]] },
    { name: 'cobalt',     shades: [[232,34,76],[232,42,68],[232,50,60],[232,58,52],[232,66,44],[232,74,36]] },
    { name: 'indigo',     shades: [[252,72,76],[252,72,68],[252,72,60],[252,72,52],[252,72,44],[252,72,36]] },
  ]},
  { label: 'Neutrals', families: [
    { name: 'neutral',    shades: [[0,0,100],[0,0,96],[0,0,72],[0,0,44],[0,0,25],[0,0,6]] },
  ]},
];

