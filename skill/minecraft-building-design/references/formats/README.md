# 三种蓝图格式对比与选型

## 快速对比

| 特性 | Vanilla NBT | Create Mod | Litematica |
|------|------------|------------|------------|
| 文件扩展名 | `.nbt` | `.nbt` | `.litematic` |
| 压缩方式 | GZip | GZip | GZip |
| 调色板 | `palette[]` | `palette[]` | `BlockStatePalette[]` |
| 方块存储 | `blocks[]` 独立 Compound | `blocks[]` 独立 Compound | `BlockStates` 位压缩 LongArray |
| 方块实体 | `blocks[].nbt` | `blocks[].nbt` | `TileEntities[]` |
| 机械动力实体 | ❌ | ✅ `schematic_entities[]` | ❌ |
| 元数据 | ❌ | ✅ `metadata` | ✅ `Metadata` |
| 最大体积 | 无硬限制 | 无硬限制 | 无硬限制（位压缩效率高） |
| 适用工具 | 结构方块 | Schematicannon | Litematica mod |
| 文件格式版本 | 无 | `version: 1` | `Version: 5` |

## 选型决策树

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

## NBT 标签类型参考

| 标签 | ID | Python 生成器 | 说明 |
|------|----|--------------|------|
| `TAG_END` | 0 | — | 复合标签结束标记 |
| `TAG_BYTE` | 1 | `T_byte(name, v)` | 有符号 8 位 |
| `TAG_SHORT` | 2 | `T_short(name, v)` | 有符号 16 位 |
| `TAG_INT` | 3 | `T_int(name, v)` | 有符号 32 位 |
| `TAG_LONG` | 4 | `T_long(name, v)` | 有符号 64 位 |
| `TAG_FLOAT` | 5 | `T_float(name, v)` | 32 位浮点 |
| `TAG_DOUBLE` | 6 | `T_double(name, v)` | 64 位浮点 |
| `TAG_BYTE_ARRAY` | 7 | `T_byte_array(name, v)` | 字节数组 |
| `TAG_STRING` | 8 | `T_string(name, v)` | UTF-8 字符串 |
| `TAG_LIST` | 9 | `T_list(name, elem_type, items)` | 同类型元素列表 |
| `TAG_COMPOUND` | 10 | `T_compound(name, children)` | 键值对集合 |
| `TAG_INT_ARRAY` | 11 | `T_int_array(name, v)` | 32 位整型数组 |
| `TAG_LONG_ARRAY` | 12 | `T_long_array(name, v)` | 64 位整型数组 |

## 相关脚本

| 脚本 | 用途 |
|------|------|
| `scripts/nbt_utils.py` | 零依赖 NBT 序列化核心 |
| `scripts/create_builder.py` | Create Mod 蓝图生成器 + 齿轮箱示例 |
| `scripts/litematica_gen.py` | Litematica 位压缩/解压工具 |
| `scripts/design_helpers.py` | 建筑设计辅助函数 |
| `scripts/examples/modern_villa.py` | 现代别墅完整示例（输出三种格式） |
