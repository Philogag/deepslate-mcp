# Vanilla NBT Structure Format

> Minecraft 原版结构方块 (Structure Block) 导出的 `.nbt` 文件格式规范。
> 适用于纯原版环境下的建筑蓝图分享和结构方块加载。

---

## Format Overview

```
Root Compound {
  size: [12, 10, 8]              // NbtList<NbtInt> — [W, H, D] 结构尺寸
  palette: [                      // NbtList<NbtCompound> — 方块调色板
    { Name: "minecraft:air" },                           // index 0
    { Name: "minecraft:oak_planks" },                    // index 1
    {
      Name: "minecraft:oak_stairs",                      // index 2
      Properties: { facing: "north", half: "bottom" }    // 可选方块属性
    }
  ]
  blocks: [                        // NbtList<NbtCompound> — 方块数据
    {
      pos: [0, 0, 0],              // NbtList<NbtInt> — [x, y, z]
      state: 1                     // NbtInt — palette 索引
    },
    {
      pos: [1, 0, 0],
      state: 2,
      nbt: { ... }                 // NbtCompound — 方块实体数据（可选，如箱子内容）
    }
  ]
  entities: []                     // NbtList<NbtCompound> — 实体（可选）
}
```

## Key Constraints

- `palette[0]` **必须**为 `minecraft:air`
- `blocks[].state` 索引指向 `palette` 中对应元素
- 方块坐标是结构本地坐标（从 `[0,0,0]` 起）
- 方块实体通过 `blocks[].nbt` 附加，包含 `id` 字段（如 `"minecraft:chest"`）
- 调色板中的方块 ID 必须是完整命名空间（如 `minecraft:stone` 而非 `stone`）

## TypeScript Generation (with deepslate)

```typescript
import { Structure, NbtFile } from 'deepslate';
import { writeFile } from 'node:fs/promises';

const structure = new Structure([5, 5, 5]);
structure.addBlock([0, 0, 0], 'minecraft:stone');
structure.addBlock([1, 0, 0], 'minecraft:oak_planks');
structure.addBlock([2, 0, 0], 'minecraft:oak_stairs',
  { facing: 'north', half: 'bottom', shape: 'straight' }
);

const nbtFile = new NbtFile(structure.toNbt());
await writeFile('building.nbt', nbtFile.toBuffer());
```

## Python Generation

参见 `designs/generators/nbt_utils.py` — Python 原生 NBT 序列化工具。

```python
from designs.generators.nbt_utils import (
    T_compound, T_string, T_int, T_list, T_pos, T_block_state, nbt_to_bytes
)

# 构建调色板 + 方块列表
palette = [
    T_block_state(None, "minecraft:air"),
    T_block_state(None, "minecraft:oak_planks"),
]
blocks = [
    T_compound(None, [T_pos("pos", 0, 0, 0), T_int("state", 0)]),
    T_compound(None, [T_pos("pos", 1, 0, 0), T_int("state", 1)]),
]

root = [
    T_pos("size", 5, 5, 5),
    T_list("palette", 10, palette),  # TAG_COMPOUND = 10
    T_list("blocks", 10, blocks),
    T_list("entities", 10, []),
]

with open("building.nbt", "wb") as f:
    f.write(nbt_to_bytes(root))
```

## Verification

```bash
# 检查是否合法的 GZip NBT
file building.nbt        # 应输出 "gzip compressed data"

# 用 deepslate-mcp 预览
# render_structure({ nbt_path: "building.nbt" })
```
