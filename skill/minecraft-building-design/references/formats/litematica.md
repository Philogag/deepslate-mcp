# Litematica Structure Format

> Litematica Mod 使用的 `.litematic` 蓝图格式。
> 使用位压缩 (bit-packing) LongArray 存储方块索引，支持超大结构。

---

## Format Overview

```
Root Compound {
  Regions: [                            // NbtList<NbtCompound> — 区域列表
    {
      Name: "Region_1",                 // NbtString
      Position: [x, y, z],              // NbtList<NbtInt> — 世界坐标系原点偏移
      Size: [sx, sy, sz],              // NbtList<NbtInt> — 本区域尺寸
      
      BlockStatePalette: [              // NbtList<NbtCompound> — 方块状态调色板
        { Name: "minecraft:air" },      // index 0
        { Name: "minecraft:stone" },    // index 1
        { Name: "minecraft:oak_stairs", Properties: {...} }
      ],
      
      BlockStates: [                    // NbtLongArray — ⭐ 位压缩方块索引
        // 每个方块由 palette index 的 bits 数表示
        // bits = max(2, ceil(log2(palette_size)))
        // YXZ 顺序: index = y * sz * sx + z * sx + x
      ],
      
      TileEntities: [                   // NbtList<NbtCompound> — 方块实体（可选）
        { id: "minecraft:chest", ... }
      ],
      
      Entities: [                       // NbtList<NbtCompound> — 实体（可选）
        { id: "minecraft:item_frame", ... }
      ],
      
      PendingBlockTicks: [],            // NbtList — 计划刻（可选）
      PendingFluidTicks: [],            // NbtList — 计划流体刻（可选）
    }
  ],
  
  Metadata: {                           // NbtCompound — 文件元数据
    Name: "My Build",                   // NbtString — 蓝图名称
    Author: "player_name",              // NbtString — 作者
    Description: "...",                 // NbtString — 描述（可选）
    TimeCreated: 1234567890,            // NbtLong — 创建时间戳
    TimeModified: 1234567890,           // NbtLong — 修改时间戳
    TotalBlocks: 1200,                  // NbtInt — 方块总数
    TotalVolume: 12000,                 // NbtInt — 总体积
    EnclosingSize: [12, 8, 10],        // NbtList<NbtInt> — 外包围框
  },
  
  Version: 5                            // NbtInt — 文件格式版本
}
```

## Bit-Packed BlockStates

Litematica 使用 **LongArray** 位压缩来高效存储方块索引。

```
bits = max(2, ceil(log2(palette_size)))
     = 2  (palette ≤ 4)
     = 3  (palette ≤ 8)
     = 4  (palette ≤ 16)
     = 5  (palette ≤ 32)
     = 6  (palette ≤ 64)
     = 7  (palette ≤ 128)
     = 8  (palette ≤ 256)  ← 常见
     ...

YXZ 索引顺序（x 最内层，y 最外层）:
    index = y * sizeZ * sizeX + z * sizeX + x

位偏移:  bitOffset = index * bits
长整型数组索引: longIndex = Math.floor(bitOffset / 64)
长整型内偏移:   innerOffset = bitOffset % 64
```

### Python Generator

```python
from designs.generators.litematica_gen import generate_litematic_blocks

blocks = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, ...]  # YXZ order
long_array = generate_litematic_blocks(5, 5, 5, palette, blocks)
```

### TypeScript Bit-Packing

```typescript
function packBlockStates(
  blockIndices: number[],
  bits: number
): bigint[] {
  const totalBits = blockIndices.length * bits;
  const longsNeeded = Math.ceil(totalBits / 64);
  const result = new Array(longsNeeded).fill(0n);
  for (let i = 0; i < blockIndices.length; i++) {
    const bitOffset = i * bits;
    const arrIdx = Math.floor(bitOffset / 64);
    const inner = bitOffset % 64;
    result[arrIdx] |= BigInt(blockIndices[i]) << BigInt(inner);
    if (inner + bits > 64) {
      const carry = BigInt(blockIndices[i]) >> BigInt(64 - inner);
      result[arrIdx + 1] |= carry;
    }
  }
  return result;
}
```

## Verification

```bash
file building.litematic   # 应输出 "gzip compressed data"

# 用 deepslate-mcp 预览
# render_structure({ nbt_path: "building.litematic" })
```
