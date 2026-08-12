/** Canonical project data — fetch src/data/projects.json (single source of truth).
 *  Root projects.json is a synced copy of the same file. Rebuild dims with:
 *  node scripts/build-canonical-data.mjs
 */
let _data = null;
export async function loadProjects() {
  if (_data) return _data;
  const res = await fetch(new URL('./projects.json', import.meta.url));
  if (!res.ok) throw new Error('Failed to load projects.json');
  _data = await res.json();
  return _data;
}
export function getData() {
  if (!_data) throw new Error('projects not loaded');
  return _data;
}
