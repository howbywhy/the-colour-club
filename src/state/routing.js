/**
 * URL ↔ world reconciliation only.
 * Wired from main.js (syncHash / applyHash / expectHash) — kept there for closure access to
 * openProject/closeProject/setView/setFilter/setDepth/lateral. This module documents the route model.
 *
 * #/                      field, all
 * #/index                 index, all
 * #/<sector>              field, filtered
 * #/index/<sector>        index, filtered
 * #/p/<id>                project Images
 * #/p/<id>/idea           project Idea
 * … + /info
 */
export const ROUTE_NOTES = 'See main.js syncHash/applyHash — quiet reconciliation is lock-exempt.';
