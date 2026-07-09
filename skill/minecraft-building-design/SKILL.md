---
name: minecraft-building-design
description: "Minecraft 建筑设计到蓝图文件输出和预览工作流。专注三种格式：Vanilla NBT 结构、Create Mod 机械动力蓝图、Litematica 结构。"
version: 1.0.0
author: Nova
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [Minecraft, Building, Create, Schematic, NBT, Litematica, Blueprint]
    related_skills: []
---

# Minecraft 建筑设计 · 蓝图输出与预览

完整建筑设计到蓝图文件工作流。专注 **三种蓝图格式** 的规范、生成和预览。

自带 Python NBT 序列化工具（零外部依赖），配合 `deepslate-mcp` 可直接渲染预览。

---

## 安装到 Hermes

```bash
# 从仓库根目录
hermes skill install ./skill/minecraft-building-design

# 或手动复制
cp -r skill/minecraft-building-design ~/.hermes/skills/creative/
```

安装后即可在 Hermes 中加载：
```
skill_view(name='minecraft-building-design')
```

---

## 快速参考

| 格式 | 文件扩展名 | 压缩 | NBT Root | 适用场景 |
|------|-----------|------|----------|---------|
| Vanilla NBT 结构 | `.nbt` | GZip | `NbtCompound` | 原版结构方块导出 |
| Create Mod 机械动力蓝图 | `.nbt` | GZip | `NbtCompound` | 机械动力 Schematicannon |
| Litematica 结构 | `.litematic` | GZip | `NbtCompound` | Litematica mod 编辑 |

---

## 文件清单

```
skill/minecraft-building-design/
├── SKILL.md                              ← 本文件（skill 定义）
├── scripts/
│   ├── nbt_utils.py                      ← 零依赖 NBT 序列化工具
│   ├── create_builder.py                 ← Create Mod 蓝图生成器
│   ├── litematica_gen.py                 ← Litematica 位压缩工具
│   ├── design_helpers.py                 ← 建筑设计辅助函数
│   └── examples/
│       └── modern_villa.py               ← 现代别墅完整示例
├── references/
│   └── formats/
│       ├── README.md                     ← 格式对比 & 选型决策树
│       ├── vanilla-nbt.md                ← 原版 NBT 结构规范
│       ├── create-schematic.md           ← 机械动力蓝图规范
│       └── litematica.md                 ← Litematica 格式规范
└── templates/                            ← (预留：蓝图模板)
```

---

## 使用流程

### 1. 设计建筑 → 用 Python 生成蓝图

```python
from scripts.design_helpers import fill_cuboid, hollow_cuboid
from scripts.create_builder import CreateSchematic

sc = CreateSchematic(11, 8, 9)

# 地基 + 外墙 + 窗户
fill_cuboid(sc, 0, 0, 0, 10, 0, 8, "minecraft:dark_oak_planks")
# ... 详细见 examples/modern_villa.py

sc.set_metadata(author="Nova", name="Modern Villa")
data = sc.build()
with open("modern_villa.nbt", "wb") as f:
    f.write(data)
```

### 2. 预览 → 用 deepslate-mcp 渲染

```json
{
  "nbt_path": "modern_villa.nbt",
  "angle": "isometric",
  "width": 1024,
  "height": 768
}
```

### 3. 加载到游戏
- **Vanilla NBT**: 原版结构方块加载
- **Create**: 蓝图桌 (Schematic Table) → 蓝图大炮 (Schematicannon)
- **Litematica**: Litematica mod → `schematic load`

---

## 三种格式的选型决策树

```
Q: 是否包含机械动力的传动/齿轮/部署器等动态组件？
├─ 是 → 用 Create Mod 格式 (.nbt)
│  需要: palette + blocks + schematic_entities
│  
└─ 否 → Q: 结构是否超过 64×64×64？
    ├─ 是 → 用 Litematica (.litematic)
    │  需要: 位压缩 BlockStates, 多 Region 支持
    │  
    └─ 否 → Q: 需要纯原版兼容？
        ├─ 是 → 用 Vanilla NBT 结构 (.nbt)
        │  需要: structure.toNbt()
        │  
        └─ 否 → 按工具需求选择
```

---

## Python 生成器快速入门

```python
# 方式 A: 生成 Vanilla NBT
from scripts.nbt_utils import (
    T_compound, T_string, T_int, T_list, T_pos, T_block_state, nbt_to_bytes
)

palette = [
    T_block_state(None, "minecraft:air"),
    T_block_state(None, "minecraft:stone"),
    T_block_state(None, "minecraft:oak_planks"),
]
blocks = [
    T_compound(None, [T_pos("pos", 0, 0, 0), T_int("state", 1)]),
    T_compound(None, [T_pos("pos", 1, 0, 0), T_int("state", 2)]),
]
root = [
    T_pos("size", 5, 1, 1),
    T_list("palette", 10, palette),
    T_list("blocks", 10, blocks),
    T_list("entities", 10, []),
]
data = nbt_to_bytes(root)
with open("output.nbt", "wb") as f:
    f.write(data)

# 方式 B: 生成 Create 蓝图（含 metadata）
from scripts.create_builder import CreateSchematic
sc = CreateSchematic(5, 3, 5)
sc.add_block(0, 0, 0, "minecraft:stone")
sc.set_metadata(author="Nova", name="Test")
data = sc.build()
with open("create_test.nbt", "wb") as f:
    f.write(data)
```

---

## 配合 deepslate-mcp 渲染

这个 skill 与 `deepslate-mcp` 天然互补：
- **deepslate-mcp**: 读取 `.nbt`/`.schem`/`.litematic` → PNG 渲染
- **本 skill**: 从零生成这些蓝图文件

```bash
# 生成 → 渲染 一条龙
python3 scripts/examples/modern_villa.py
# 然后用 deepslate-mcp 渲染:
# render_structure({ nbt_path: "modern_villa.nbt" })
```

---

## 常见问题

**Q: Create 蓝图在游戏里用 Schematicannon 无法正确放置？**
- 检查 `schematic_entities` 是否正确——每个机械动力方块需要对应的 entity 定义
- 检查 `blocks[].nbt` 中是否包含正确的 `id` 字段（如 `"create:deployer"`）
- Create 的 `version` 字段必须为 `1`

**Q: Litematica 打开显示错位的方块？**
- 确认 `bits` 计算正确：`bits = max(2, ceil(log2(palette_size)))`
- 确认 YXZ 索引顺序：`index = y * sz * sx + z * sx + x`
- 确认 LongArray 的 endianness

**Q: 如何从现有存档生成蓝图？**
1. 原版：游戏内用结构方块选定区域 → 导出 `.nbt`
2. Create：使用蓝图桌 (Schematic Table) → 导出 `.nbt`
3. Litematica：选好区域 → `schematic save <name>` → 导出 `.litematic`

**Q: deepslate-mcp 能渲染 Create 蓝图吗？**
目前 deepslate 不直接支持 Create 的额外实体渲染。但方块的渲染是正常的——`schematic_entities` 中的额外数据不影响方块渲染，只影响 Schematicannon 的行为。
