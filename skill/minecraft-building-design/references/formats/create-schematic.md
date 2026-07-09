# Create Mod Schematic Format

> 机械动力 (Create Mod) 的蓝图文件格式，也是 `.nbt` 后缀。
> 与 Vanilla NBT 结构格式**不同**——包含机械动力特有的 `schematic_entities`。
> 由 Create 的 `SchematicWorld` / `SchematicPrinter` 解析。

---

## Format Overview

```
Root Compound {
  size: [12, 10, 8]                   // NbtList<NbtInt> — [W, H, D]
  
  palette: [                           // NbtList<NbtCompound> — 方块调色板
    { Name: "minecraft:air" },
    { Name: "minecraft:stone", Properties: { ... } },
    { Name: "create:mechanical_piston", Properties: { ... } }
  ]
  
  blocks: [                            // NbtList<NbtCompound> — 方块列表
    { pos: [0, 0, 0], state: 1 },
    { pos: [1, 0, 0], state: 2,
      nbt: { id: "create:mechanical_piston_head", ... }  // 可选方块实体 NBT
    }
  ]
  
  entities: [                          // NbtList<NbtCompound> — 普通实体（可选）
    { id: "minecraft:item_frame", pos: [...], ... }
  ]
  
  schematic_entities: [                // NbtList<NbtCompound> — ⭐ 机械动力特有
    {
      pos: [5, 2, 3],                  // NbtList<NbtInt> — 实体位置
      block: {                         // NbtCompound — 关联的方块
        Name: "create:deployer",
        Properties: { facing: "north" }
      },
      nbt: {                           // NbtCompound — 实体完整 NBT
        id: "create:deployer",
        ... (完整实体数据，含动画状态、物品栈等)
      }
    }
  ]
  
  version: 1                           // NbtInt — 蓝图格式版本
  
  metadata: {                          // NbtCompound — 元数据（可选）
    author: "player_name",             // NbtString
    name: "My Build",                  // NbtString
    description: "A nice house"        // NbtString
  }
}
```

## Key Concept: `schematic_entities`

这是 Create 蓝图的核心，记录了**机械动力特有实体**（部署器、机械臂、活塞等）的放置信息。

| 实体类型 | 作用 | 关键 NBT 字段 |
|---------|------|-------------|
| `create:deployer` | 部署器 | `facing`, `heldItem`, `animation` |
| `create:mechanical_piston` | 机械活塞 | `direction`, `extensionLength` |
| `create:mechanical_bearing` | 轴承 | `facing`, `runningState` |
| `create:windmill_bearing` | 风车轴承 | `facing`, `rotated` |
| `create:clutch` | 离合器 | `facing`, `state` |
| `create:gearshift` | 齿轮换挡器 | `facing`, `state` |
| `create:stockpile_switch` | 积料检测器 | `facing`, `idleSpeed` |
| `create:rotation_speed_controller` | 转速控制器 | `speed`, `facing` |

`schematic_entities` 与 `blocks` 是**互补**的——`blocks` 定义方块放置，`schematic_entities` 定义实体行为。一个方块可以在 `blocks` 中（作为 block entity），同时对应的实体在 `schematic_entities` 中。

## Key Differences from Vanilla NBT

| 特性 | Vanilla NBT | Create Mod |
|------|------------|------------|
| NBT 根结构 | `size`, `palette`, `blocks` | 同上 + `schematic_entities` |
| blocks 存储 | 独立 NbtCompound 列表 | 独立 NbtCompound 列表（相同结构） |
| 方块索引 | `blocks[].state` + palette | 同上 |
| 方块实体 | `blocks[].nbt` | 同上 |
| 机械动力实体 | ❌ 不支持 | ✅ `schematic_entities[]` |
| metadata | ❌ | ✅ 可选 `author/name/description` |
| version | ❌ | ✅ 固定 `1` |

## Python Generator

```python
from designs.generators.create_builder import CreateSchematic

sc = CreateSchematic(5, 3, 5)

# 底座
for x in range(5):
    for z in range(5):
        sc.add_block(x, 0, z, "minecraft:cobblestone")

# 部署器
sc.add_block(2, 2, 0, "create:deployer", {"facing": "north"})

# 部署器实体 (schematic_entity)
sc.add_schematic_entity(2, 2, 0, "create:deployer",
    {"facing": "north"},
    [T_string("id", "create:deployer"),
     T_string("facing", "north"),
     T_int("animation", 0),
     T_compound("heldItem", [])])

sc.set_metadata(author="Nova", name="Demo", description="Create demo")
data = sc.build()
with open("demo.nbt", "wb") as f:
    f.write(data)
```

## Verification

```bash
# Create 蓝图也是 GZip 压缩的 NBT
file demo.nbt        # 应输出 "gzip compressed data"

# 用 deepslate-mcp 预览（方块部分正常渲染）
# render_structure({ nbt_path: "demo.nbt" })
```
