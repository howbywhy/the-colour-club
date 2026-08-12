# The Colour Club — Local V2

## Reference (immutable)

- `tcc-v2-stable.html` — handoff baseline (do not edit)
- `reference/tcc-v2-stable.html` — verbatim copy

## Development

- `tcc-v2-dev.html` — monolith with verified QA fixes
- `index.html` + `src/` — modular ES-module build (parity target)

## Local server

```bash
python3 -m http.server 8000
```

- Reference: http://127.0.0.1:8000/tcc-v2-stable.html
- Dev monolith: http://127.0.0.1:8000/tcc-v2-dev.html
- Modular: http://127.0.0.1:8000/index.html

## Verify

```bash
node verify.mjs tcc-v2-stable.html
```

## Assets

```bash
bash collect-assets.sh
# optional Vidzflow:
#   brew install yt-dlp && bash collect-assets.sh
```

After images land, rebuild canonical data + intrinsic dimensions:

```bash
node scripts/build-canonical-data.mjs
```

This writes `src/data/projects.json` and syncs root `projects.json` (same content).  
Until local files exist, the site falls back to the Webflow CDN via `onerror`.
