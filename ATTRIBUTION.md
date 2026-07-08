# Attribution & Third-Party Licenses

> `deepslate-mcp` is a thin wrapper around third-party libraries.
> This document tracks every dependency and its license obligations.

---

## Upstream: `misode/deepslate`

- **Repository**: https://github.com/misode/deepslate
- **Author**: Misode
- **License**: MIT
- **Copyright**: © 2021 Misode
- **Pinned version**: `^0.26.0` (see `package.json`)
- **Used by us**: We import `Structure`, `StructureRenderer`,
  `ItemRenderer`, `BlockDefinition`, `BlockModel`, `TextureAtlas`,
  `NbtFile`, `Identifier`, and related types from the `deepslate`
  npm package. We do **not** modify or fork the source.

### MIT license terms (summary)

> Permission is hereby granted, free of charge, to any person obtaining
> a copy of this software and associated documentation files (the
> "Software"), to deal in the Software without restriction, including
> without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to
> permit persons to whom the Software is furnished to do so, subject
> to the standard MIT conditions.

The full text is preserved verbatim in [`LICENSE-deepslate`](./LICENSE-deepslate).

### Compliance with this project

1. The original MIT `LICENSE` is shipped at the project root as
   [`LICENSE-deepslate`](./LICENSE-deepslate) (a verbatim copy of
   upstream's `LICENSE`).
2. The original copyright notice appears in this attribution file
   and in our top-level `NOTICE`.
3. We do not modify the upstream source — we consume it via npm.

---

## Upstream: `misode/mcmeta`

- **Repository**: https://github.com/misode/mcmeta
- **Author**: Misode
- **License**: CC-BY-SA-4.0
- **Used by us**: We fetch the pre-baked JSON summaries and the
  texture atlas PNG from `misode/mcmeta@summary/assets/...` and
  `misode/mcmeta@atlas/all/...` at runtime.

These are **not** redistributed — every render hits the upstream
CDN or a local cache populated from it. The CC-BY-SA license
obliges us to attribute Misode; we do so here and in the rendered
output's metadata (where supported).

---

## Upstream: Mojang AB

- **Minecraft** content, including all block models, textures, and
  the client JAR, is © Mojang AB and licensed separately.
- **Our policy**: We **never** ship Mojang-owned assets. Vanilla
  resources are fetched at runtime either from `misode/mcmeta`
  (data summaries + atlas) or directly from Mojang's Piston API
  (the optional `1.21.jar` overlay).
- **EULA compliance**: Users of `deepslate-mcp` are responsible for
  ensuring their use of rendered output complies with the
  [Minecraft EULA](https://www.minecraft.net/en-us/eula) and
  [Minecraft Usage Guidelines](https://www.minecraft.net/en-us/usage-guidelines).

---

## Runtime dependencies (npm)

| Package | License | Use |
|---|---|---|
| `@modelcontextprotocol/server` | MIT | MCP server SDK |
| `deepslate` | MIT | Rendering engine (see above) |
| `gl-matrix` | MIT | Matrix math (deepslate's dep) |
| `gl` | MIT | Headless WebGL |
| `pngjs` | MIT | PNG encoding |
| `yauzl` | MIT | ZIP reading for resource packs |
| `pako` | MIT | gzip for `.nbt` compression |
| `md5` | BSD-3-Clause | Block-state hashing |
| `zod` | MIT | Schema validation |

All MIT/BSD deps are compatible with our MIT license.

---

## Development dependencies (npm)

| Package | License |
|---|---|
| `typescript` | Apache-2.0 |
| `tsx` | MIT |
| `@types/node` | MIT |
| `@types/pngjs` | MIT |
| `vitest` | MIT |
| `eslint` | MIT |
| `prettier` | MIT |

---

## Generated NOTICE

When packaging for npm, we generate a `NOTICE` file in the project
root containing:

```text
deepslate-mcp
Copyright (c) 2026 Philogag contributors
License: MIT

This product includes software developed by:
  - Misode (https://github.com/misode) — deepslate (MIT), mcmeta (CC-BY-SA-4.0)
  - The Model Context Protocol authors (@modelcontextprotocol/server, MIT)
  - The headless-gl contributors (MIT)
  - pngjs contributors (MIT)

Minecraft content is © Mojang AB and is not redistributed by this project.
```

---

## Reporting an issue

If you believe this attribution is incomplete or incorrect, please
open an issue at https://github.com/philogag/deepslate-mcp/issues.