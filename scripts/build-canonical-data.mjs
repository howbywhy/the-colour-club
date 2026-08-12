#!/usr/bin/env node
/**
 * Consolidate editorial + asset inventory into one canonical projects.json,
 * reading intrinsic dimensions from local files via macOS `sips`.
 *
 * Writes: src/data/projects.json
 * Syncs:  projects.json  → identical copy (single content; root is the public alias)
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, lstatSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const editorial = JSON.parse(readFileSync(join(root, 'src/data/projects.json'), 'utf8'));
const inventory = JSON.parse(readFileSync(join(root, 'projects.json'), 'utf8'));

// If root was already replaced with canonical shape, inventory.projects may be array
const invMap = Array.isArray(inventory.projects)
  ? Object.fromEntries(inventory.projects.map(p => [p.id, p]))
  : inventory.projects;

function sipsSize(abs) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', abs], { encoding: 'utf8' });
  const w = /pixelWidth:\s*(\d+)/.exec(out);
  const h = /pixelHeight:\s*(\d+)/.exec(out);
  if (!w || !h) throw new Error('sips failed for ' + abs + '\n' + out);
  return { width: +w[1], height: +h[1] };
}

function extOf(name) {
  return name.slice(name.lastIndexOf('.'));
}

const counts = {
  images: { local: 0, remoteFallback: 0, missing: 0 },
  videos: { local: 0, embedded: 0, unresolved: 0 },
};

const projects = editorial.projects.map(p => {
  const inv = invMap[p.id] || {};
  const invImages = inv.images || [];
  const media = [];

  // Images in editorial order (files[])
  p.files.forEach((cdnFile, i) => {
    const localName = `${p.id}-${String(i + 1).padStart(2, '0')}${extOf(cdnFile)}`;
    const localPath = `public/images/projects/${p.id}/${localName}`;
    const abs = join(root, localPath);
    const invImg = invImages[i] || {};
    const remote = invImg.src || (editorial.cdn + cdnFile);
    const entry = {
      type: 'image',
      file: localName,
      original: invImg.original || decodeURIComponent(cdnFile.replace(/^[a-f0-9]+_/, '')),
      local: localPath,
      remote,
      cdnFile,
    };
    if (existsSync(abs)) {
      const { width, height } = sipsSize(abs);
      entry.width = width;
      entry.height = height;
      entry.ratio = +(width / height).toFixed(6);
      entry.status = 'local';
      counts.images.local++;
      process.stdout.write('.');
    } else {
      entry.status = 'missing';
      counts.images.missing++;
      counts.images.remoteFallback++; // runtime will use CDN
      process.stdout.write('x');
    }
    media.push(entry);
  });

  // Videos — keep editorial interleave position `at`
  for (const v of p.vids || []) {
    if (v.vf) {
      const filmGuesses = [
        `public/media/projects/${p.id}/${p.id}-film-01.mp4`,
        `public/media/projects/${p.id}/${p.id}-film-02.mp4`,
        `public/media/projects/${p.id}/${p.id}-film-01.webm`,
      ];
      // Match by index among vf vids for this project
      const vfList = (p.vids || []).filter(x => x.vf);
      const vfIndex = vfList.indexOf(v);
      const localCandidates = [
        `public/media/projects/${p.id}/${p.id}-film-${String(vfIndex + 1).padStart(2, '0')}.mp4`,
        `public/media/projects/${p.id}/${p.id}-film-${String(vfIndex + 1).padStart(2, '0')}.webm`,
        `public/media/projects/${p.id}/${p.id}-film-${String(vfIndex + 1).padStart(2, '0')}.mkv`,
      ];
      const local = localCandidates.find(c => existsSync(join(root, c))) || null;
      const entry = {
        type: 'video',
        provider: 'vidzflow',
        id: v.vf,
        at: v.at,
        embed: `https://app.vidzflow.com/v/${v.vf}`,
        local,
        remote: null,
        status: local ? 'local' : 'unresolved-embed',
      };
      if (local) counts.videos.local++;
      else { counts.videos.embedded++; counts.videos.unresolved++; }
      media.push(entry);
    } else if (v.l || v.r) {
      const local = v.l && existsSync(join(root, v.l)) ? v.l : null;
      const entry = {
        type: 'video',
        provider: 'file',
        at: v.at,
        local: local || v.l || null,
        remote: v.r || null,
        status: local ? 'local' : (v.r ? 'remote-fallback' : 'missing'),
      };
      if (local) counts.videos.local++;
      else if (v.r) counts.videos.embedded++;
      else counts.videos.unresolved++;
      media.push(entry);
    }
  }

  // Convenience views for runtime (derived — not a second source of truth)
  const images = media.filter(m => m.type === 'image');
  const videos = media.filter(m => m.type === 'video');

  return {
    id: p.id,
    name: p.name,
    strap: p.strap,
    lede: p.lede,
    cat: p.cat,
    sector: p.sector,
    emp: p.emp,
    deliv: p.deliv,
    cred: p.cred || '',
    beats: p.beats,
    sourceUrl: inv.sourceUrl || null,
    media,
    // Derived runtime fields (generated from media — do not edit by hand)
    files: images.map(m => m.cdnFile),
    dims: images.map(m => (m.width && m.height ? { width: m.width, height: m.height } : null)),
    vids: videos.map(m => {
      if (m.provider === 'vidzflow') return { at: m.at, vf: m.id, local: m.local, status: m.status };
      return { at: m.at, l: m.local, r: m.remote, status: m.status };
    }),
  };
});

const canonical = {
  cdn: editorial.cdn || inventory.cdn,
  source: inventory.source || 'https://www.thecolourclub.com.au/',
  collected: inventory.collected || null,
  updated: new Date().toISOString().slice(0, 10),
  caps: editorial.caps,
  projects,
  assetStatus: counts,
  notes: {
    canonical: 'src/data/projects.json is the single source of truth. Root projects.json is a synced copy.',
    vidzflow: 'Six films unresolved without yt-dlp — runtime uses embed iframes.',
  },
};

const outPath = join(root, 'src/data/projects.json');
// Backup inventory-shaped root if it still looks like inventory
const rootPath = join(root, 'projects.json');
try {
  const cur = JSON.parse(readFileSync(rootPath, 'utf8'));
  if (cur.projects && !Array.isArray(cur.projects)) {
    writeFileSync(join(root, 'projects.inventory.backup.json'), JSON.stringify(cur, null, 2) + '\n');
  }
} catch (_) {}

writeFileSync(outPath, JSON.stringify(canonical, null, 2) + '\n');
writeFileSync(rootPath, JSON.stringify(canonical, null, 2) + '\n');

console.log('\n\nWrote', outPath);
console.log('Synced', rootPath);
console.log(JSON.stringify(counts, null, 2));
console.log('projects', projects.length, 'media entries', projects.reduce((n, p) => n + p.media.length, 0));
