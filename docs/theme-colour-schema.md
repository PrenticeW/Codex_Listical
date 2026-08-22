# Tacular theme colour schema

Brief for Claude Design. Tacular is a 12 week planning tool with three pages: Goal, Plan and System. The System page is a dense task table (project header rows, section rows, task rows, daily min/max/total bands, a row number gutter) on top of a faint background grid. The user picks colours in a settings panel and the app derives every surface from them with CSS `color-mix()`.

## What exists today

One input colour (the "theme family" main step) plus an automatic selection colour. Everything else is derived. Problems:

1. The picked colour is never shown at full strength at rest. Header rows are a 62% tint of it, everything else paler.
2. Buttons, toggles and icons use the picked colour darkened, so they never stand out from the theme.
3. There is no separate accent. Accent and highlight are collapsed into one derived colour.

## What we want

Three user facing colour roles, each a single colour. Decide in the design whether accent and highlight are picked by the user or derived from the theme colour by rule (for example a fixed hue offset). Either is implementable.

| Role | Purpose | Needs to |
|---|---|---|
| Theme | The identity colour. Carries the table's header rows, the background grid and a few structural tints. | Be visible unmixed on the project header row. Work from pale (L76) to dark (L36) picks. |
| Accent | Interactive elements: primary buttons, toggles, active icons, focused inputs. | Stand out clearly from the theme colour. Pass contrast on white and on the theme tints. |
| Highlight | Selection state: selected cell ring, selected row wash, drag indicator, selected row gutter. | Read as "selected" against both theme surfaces and accent controls. Not be confused with accent. |

## Outputs the design must define

For each of the three inputs, the derived steps and where they apply. Today's slots, so nothing is missed:

### Theme derived
| Slot | Current recipe | Used on (System page) |
|---|---|---|
| Header band | 62% theme + white | Project header row, Year pill, Daily Total row, nav bar |
| Header text | 78% deep + black | Text on header band |
| Section | 20% theme + white | Section subheader, filter row, day cell fill |
| Min band / Max band | 36% / 22% theme + white | Daily Min and Daily Max rows |
| Min line | 48% theme + white | Divider inside Min band |
| Gutter fill / text / line | 16% theme + grey / 55% deep + grey / 24% theme + grey | Row number gutter on every row |
| Checkbox / checked cell | mid step / same as Max band | Checked checkbox, checked cell wash |
| Background grid | 15% light step, transparent | Page background grid lines |
| Panel tint / border / hover | 12% theme + white / 18% theme / 6% and 22% deep | Side panel cards, borders, hover states |
| Archive wheel ramp (4 steps + 4 label steps) | deep, theme, light mixed with white | Archive Week panel |

### Accent derived
| Slot | Currently | Used on |
|---|---|---|
| Button fill (rest) | theme darkened | Primary buttons in Gear panel, Confirm |
| Button fill (hover) | theme | Same buttons on hover |
| Toggle on | theme darkened | Settings toggles |
| Icon / dropdown text | theme darkened | Dropdown cells, context menu, filter panel, planner controls, version history |
| Focus ring / border | theme | Inputs, editing cell outline, "+" affordance, active filter icon |

### Highlight derived
| Slot | Current recipe | Used on |
|---|---|---|
| Selection ring | highlight | Selected cell, dropdown cells |
| Selected row wash | 12% highlight base + white | Selected task row, filter panel, dropdowns |
| Selected row overlay | 12% highlight, transparent | Selected project row |
| Selected gutter | 38% highlight + grey | Gutter of selected row |
| Drag indicator | highlight, 4px top border with glow | Row drag target |

## Rules the design should state

1. Text colour rule on the header band: when does header text flip between dark and white as the theme pick gets darker.
2. Minimum contrast between accent and theme, and between highlight and both.
3. Behaviour at the extremes: the palest theme pick (L76) and the darkest (L36). Show both.
4. Neutral fallback if a derived colour fails contrast.

## Deliverable format that drops straight into code

A table of CSS custom properties, one row each, with the recipe expressed as a colour or a `color-mix(in srgb, <var> <pct>, <colour>)`. Inputs are `--th-main`, `--th-accent`, `--th-highlight`. Everything else must be derived from those three plus white, black and grey. That maps one to one onto `src/index.css` and `src/lib/theme.js`.
