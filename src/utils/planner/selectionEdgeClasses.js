/**
 * Builds the CSS class string for a selected cell's outer-edge borders.
 *
 * Cell range selection (System page spreadsheet) uses neighbour-based edge
 * detection (see getCellSelectionEdges in useSpreadsheetSelection.js) so a
 * multi-cell selection reads as one bordered block instead of every cell
 * drawing its own full outline. This just turns that {top,bottom,left,right}
 * booleans object into the matching `sel-edge-*` class names (see index.css).
 *
 * @param {{top?: boolean, bottom?: boolean, left?: boolean, right?: boolean}} [edges]
 * @returns {string} space-separated class names, e.g. "sel-edge-top sel-edge-left"
 */
export function getSelectionEdgeClassNames(edges) {
  if (!edges) return '';
  return Object.entries(edges)
    .filter(([, isEdge]) => isEdge)
    .map(([side]) => `sel-edge-${side}`)
    .join(' ');
}

export default getSelectionEdgeClassNames;
