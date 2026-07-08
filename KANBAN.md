# deepslate-mcp Kanban

> Live project status board. Nova + subagents read & update this as work progresses.
> Updated: 2026-07-08

## 📍 Project Root
`/opt/data/profiles/meo/workspace/deepslate-mcp/`
Git remote: `ssh://git@git.philogag.com:2233/philogag/deepslate-mcp.git`
SSH key: `/opt/data/profiles/meo/nova-ssh/id_rsa` (use `GIT_SSH_COMMAND="ssh -i /opt/data/profiles/meo/nova-ssh/id_rsa -o StrictHostKeyChecking=no"`)

## 🏗️ Architecture Recap
- **Goal**: Expose `misode/deepslate` rendering as MCP tools. Read NBT/schem/litematic → render to PNG.
- **Stack**: Node.js 22 + TypeScript (ESM, NodeNext)
- **Render**: `gl` (headless-gl) + `deepslate` + `pngjs`
- **MCP SDK**: `@modelcontextprotocol/sdk` (latest)
- **Resources**: Auto-fetched from `misode/mcmeta`, cached locally
- **Transport**: stdio (default)
- **Tools** (final): `render_structure`, `render_blocks`, `inspect_structure`, `render_item`

## 🚦 Wave Status

| Wave | Milestone | Status | Blocked By | Owner |
|------|-----------|--------|------------|-------|
| 0 | Kanban + planning docs | ✅ Done | — | Nova (this turn) |
| 1 | **M0** Foundation (scaffold + hello MCP) | 🔴 TODO | — | subagent (free) |
| 2a | **M1** Render core | 🔴 TODO | Wave 1 | subagent (free) |
| 2b | **M2** Resource pipeline (mcmeta + cache) | 🔴 TODO | Wave 1 | subagent (free) |
| 2c | **M3** Multi-format loaders (.nbt/.schem/.litematic) | 🔴 TODO | Wave 1 | subagent (free) |
| 3 | **M4** MCP tools (4 tools) | 🔴 TODO | Wave 2a+2b+2c | subagent (free) |
| 4 | **M5** Hermes integration | 🔴 TODO | Wave 3 | Nova (hand-test) |
| 5 | **M6** Hardening | 🔴 TODO | Wave 4 | Nova (hand-test) |

## 📋 Task Cards

### Wave 1 — M0 Foundation (single subagent)
- [ ] **M0.1** `package.json` — deps: `@modelcontextprotocol/sdk` (latest), `deepslate` ^0.26, `gl-matrix` ^3.3, `gl` ^8, `pngjs` ^7, `yauzl` ^3, `zod` ^3.25; devDeps: `typescript`, `tsx`, `@types/node`, `@types/pngjs`
- [ ] **M0.2** `tsconfig.json` — NodeNext modules, ESM, strict, outDir=dist
- [ ] **M0.3** `bin/deepslate-mcp.js` — shebang launcher that imports dist/server.js
- [ ] **M0.4** `src/server.ts` — registers one `echo` tool, listens on stdio
- [ ] **M0.5** `.gitignore` — node_modules, dist, data, *.log
- [ ] **M0.6** Smoke test: `npm install && npm run dev` boots without error
- [ ] **M0.7** Commit + push

**Exit**: `node bin/deepslate-mcp.js` runs; smoke output proves MCP handshake works.

### Wave 2a — M1 Render core (single subagent, parallel with 2b/2c)
- [ ] **M1.1** `src/render/headless_canvas.ts` — `createHeadlessCanvas(w,h)` returning `{canvas, gl}` with `preserveDrawingBuffer: true`
- [ ] **M1.2** `src/render/encoder.ts` — `capturePNG(gl, w, h): Buffer` using pngjs + Y-flip
- [ ] **M1.3** `src/render/camera.ts` — `viewIsometric()`, `viewTop()`, `viewFront()`, `viewSide()` using gl-matrix mat4
- [ ] **M1.4** `src/render/pipeline.ts` — `renderStructureToPNG(structure, resources, options)`
- [ ] **M1.5** `examples/demo-structure.ts` — builds a 4×3×4 house, renders to `examples/out/house.png`
- [ ] **M1.6** Stub `resources` provider (returns opaque:false for all blocks)
- [ ] **M1.7** Commit + push

**Exit**: `npm run demo` produces non-empty PNG (>1KB).

### Wave 2b — M2 Resource pipeline (single subagent, parallel)
- [ ] **M2.1** `src/resources/cache_manager.ts` — `get/put/purge` keyed by version
- [ ] **M2.2** `src/resources/mcmeta_loader.ts` — `fetchBlockDefinitions`, `fetchBlockModels`, `fetchTextureAtlas`
- [ ] **M2.3** `src/resources/index.ts` — `buildResources()` orchestrator with version-check cache
- [ ] **M2.4** Wire `buildResources()` into M1 pipeline
- [ ] **M2.5** Re-render demo, verify textured blocks
- [ ] **M2.6** Commit + push

**Exit**: Re-render shows correctly-textured blocks; cache populated; offline re-run works.

### Wave 2c — M3 Multi-format loaders (single subagent, parallel)
- [ ] **M3.1** `src/structures/nbt_loader.ts` — vanilla `.nbt` structure blocks
- [ ] **M3.2** `src/structures/schem_loader.ts` — Sponge `.schem` (Palette+BlockData)
- [ ] **M3.3** `src/structures/litematic_loader.ts` — `.litematic` regions
- [ ] **M3.4** `src/structures/builder.ts` — `Builder.fromBlocks(BlockSpec[])`
- [ ] **M3.5** `src/structures/index.ts` — `loadStructure(path)` dispatch by extension
- [ ] **M3.6** Add 3 fixtures under `examples/fixtures/`
- [ ] **M3.7** Commit + push

**Exit**: All three loaders unit-test with real fixtures; dispatcher picks correct one.

### Wave 3 — M4 MCP tools (single subagent)
- [ ] **M4.1** `src/tools/render_structure.ts` — zod schema per TOOLS.md
- [ ] **M4.2** `src/tools/render_blocks.ts`
- [ ] **M4.3** `src/tools/inspect_structure.ts`
- [ ] **M4.4** `src/tools/render_item.ts`
- [ ] **M4.5** `src/server.ts` registers all 4 tools
- [ ] **M4.6** `src/utils/paths.ts`
- [ ] **M4.7** Commit + push

**Exit**: MCP inspector lists all 4 tools; each returns valid response on fixture.

### Wave 4 — M5 Hermes integration (Nova hand-test)
- [ ] **M5.1** Write `~/.hermes/profiles/meo/mcp_config.json` with deepslate-mcp entry
- [ ] **M5.2** Restart session; confirm `mcp__deepslate-mcp__*` tools appear
- [ ] **M5.3** End-to-end: render `examples/fixtures/tiny_house.nbt` via chat
- [ ] **M5.4** `INTEGRATION.md` doc

### Wave 5 — M6 Hardening (Nova hand-test)
- [ ] **M6.1** Error UX audit
- [ ] **M6.2** Cache invalidation policy
- [ ] **M6.3** Progress reporting (stderr)
- [ ] **M6.4** Unit tests for loaders (vitest)
- [ ] **M6.5** Full smoke `npm test`
- [ ] **M6.6** `npm pack` dry-run
- [ ] **M6.7** README polish

## 📝 Subagent Prompt Template

Every dispatched subagent gets:
1. **Project root** and git remote
2. **This KANBAN section** for the wave they own
3. **Full ARCHITECTURE.md summary** (or relevant excerpt)
4. **Explicit exit criteria** ("do not declare done until you have run X and seen Y")
5. **Commit + push command** with SSH key
6. **language**: respond in Chinese (the user is Chinese-speaking)
7. **Model**: `auto/free` — pick cheapest free model
8. **Report back** with: files created, commands run, exit criteria verified, commit SHA

## 🔗 Cross-Wave Coordination Rules

- **Wave 2a/2b/2c may run in parallel** (different file trees), but each subagent must pull latest `main` before starting.
- **Wave 3 must wait** until all Wave 2 tasks are merged.
- **Subagent conflicts**: if a subagent finds a Wave-2 sibling edited a file it expected, abort + report — Nova resolves.
- **Branch strategy**: no feature branches; subagents commit directly to `main` after `git pull --rebase`. (Single-author project.)