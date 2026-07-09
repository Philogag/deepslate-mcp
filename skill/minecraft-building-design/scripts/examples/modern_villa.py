"""
现代风格小别墅完整示例。

生成一栋带落地窗、二楼露台、石砖屋顶的现代别墅。
支持输出三种格式：Vanilla NBT / Create 蓝图 / Litematica。

用法:
    python3 modern_villa.py
    
    将生成:
      - modern_villa.nbt      (Create 蓝图格式)
      - modern_villa_vanilla.nbt (Vanilla NBT 结构)
"""

import sys
import os

# 确保能找到上级目录的模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from nbt_utils import (
    T_compound, T_string, T_int, T_long, T_list, T_pos,
    T_block_state, T_long_array, nbt_to_bytes, TAG_COMPOUND,
)
from create_builder import CreateSchematic
from litematica_gen import generate_litematic_blocks, yxz_index
from design_helpers import fill_cuboid, hollow_cuboid, palette_stats


def build_villa_blocks() -> dict:
    """构建别墅的方块数据，返回 {(x,y,z): block_id} 字典。"""
    W, H, D = 11, 7, 9
    blocks = {}

    # 地基：深色橡木木板
    fill_cuboid(blocks, 0, 0, 0, W - 1, 0, D - 1,
                "minecraft:dark_oak_planks")

    # 外墙：白色混凝土
    hollow_cuboid(blocks, 0, 1, 0, W - 1, 4, D - 1,
                  "minecraft:white_concrete",
                  floor=None, roof="minecraft:white_concrete")

    # 大落地窗（南墙, z=0）
    for y in range(1, 4):
        for x in range(2, 6):
            blocks[(x, y, 0)] = "minecraft:glass"
    for x in range(6, 9):
        blocks[(x, 2, 0)] = "minecraft:glass"

    # 正门（南墙）
    blocks[(1, 1, 0)] = "minecraft:oak_door"
    blocks[(1, 2, 0)] = "minecraft:oak_door"

    # 二楼露台地板
    fill_cuboid(blocks, 2, 5, 2, W - 3, 5, D - 3,
                "minecraft:spruce_planks")

    # 露台玻璃护栏
    for x in range(2, W - 2):
        blocks[(x, 6, 2)] = "minecraft:glass"
        blocks[(x, 6, D - 3)] = "minecraft:glass"
    for z in range(2, D - 2):
        blocks[(2, 6, z)] = "minecraft:glass"
        blocks[(W - 3, 6, z)] = "minecraft:glass"

    # 屋顶：石砖台阶
    for x in range(1, W - 1):
        for z in range(1, D - 1):
            blocks[(x, 7, z)] = "minecraft:stone_brick_slab"

    return blocks


def export_create_schematic(blocks: dict, path: str):
    """输出为 Create 蓝图格式。"""
    # 确定尺寸
    all_pos = list(blocks.keys())
    if not all_pos:
        print("❌ 没有方块数据")
        return

    max_x = max(p[0] for p in all_pos) + 1
    max_y = max(p[1] for p in all_pos) + 1
    max_z = max(p[2] for p in all_pos) + 1

    sc = CreateSchematic(max_x, max_y, max_z)
    for (x, y, z), bid in blocks.items():
        if isinstance(bid, tuple):
            sc.add_block(x, y, z, bid[0], bid[1])
        else:
            sc.add_block(x, y, z, bid)

    sc.set_metadata(author="Nova", name="Modern Villa",
                    description="Modern style villa with glass walls")

    data = sc.build()
    with open(path, "wb") as f:
        f.write(data)
    print(f"✅ {path} ({len(data)} bytes, {max_x}×{max_y}×{max_z})")


def export_vanilla_nbt(blocks: dict, path: str):
    """输出为 Vanilla NBT 结构格式。"""
    all_pos = list(blocks.keys())
    if not all_pos:
        return

    max_x = max(p[0] for p in all_pos) + 1
    max_y = max(p[1] for p in all_pos) + 1
    max_z = max(p[2] for p in all_pos) + 1

    # 构建调色板
    palette_map = {}
    palette_list = []
    palette_map["minecraft:air"] = 0
    palette_list.append(T_block_state(None, "minecraft:air"))

    block_entries = []
    for (x, y, z), bid in blocks.items():
        block_id = bid if isinstance(bid, str) else bid[0]
        properties = bid[1] if isinstance(bid, tuple) else None

        key = f"{block_id}@{sorted((properties or {}).items())}"
        if key not in palette_map:
            idx = len(palette_list)
            palette_map[key] = idx
            palette_list.append(T_block_state(None, block_id, properties))
        state_idx = palette_map[key]

        children = [T_pos("pos", x, y, z), T_int("state", state_idx)]
        block_entries.append(T_compound(None, children))

    root = [
        T_pos("size", max_x, max_y, max_z),
        T_list("palette", TAG_COMPOUND, palette_list),
        T_list("blocks", TAG_COMPOUND, block_entries),
        T_list("entities", TAG_COMPOUND, []),
    ]

    data = nbt_to_bytes(root)
    with open(path, "wb") as f:
        f.write(data)
    print(f"✅ {path} ({len(data)} bytes, {max_x}×{max_y}×{max_z})")


def export_litematic(blocks: dict, path: str):
    """输出为 .litematic 格式（Litematica）。"""
    all_pos = list(blocks.keys())
    if not all_pos:
        return

    max_x = max(p[0] for p in all_pos) + 1
    max_y = max(p[1] for p in all_pos) + 1
    max_z = max(p[2] for p in all_pos) + 1

    # 构建调色板
    palette_map = {}
    palette_name_list = []
    palette_nbt_list = []

    def get_palette_idx(block_id):
        if block_id not in palette_map:
            idx = len(palette_name_list)
            palette_map[block_id] = idx
            palette_name_list.append(block_id)
            palette_nbt_list.append(T_block_state(None, block_id))
            return idx
        return palette_map[block_id]

    get_palette_idx("minecraft:air")
    for bid in blocks.values():
        if isinstance(bid, tuple):
            get_palette_idx(bid[0])
        else:
            get_palette_idx(bid)

    # 构建 YXZ 顺序的方块索引
    total = max_x * max_y * max_z
    block_indices = [0] * total
    for (x, y, z), bid in blocks.items():
        block_id = bid if isinstance(bid, str) else bid[0]
        idx = yxz_index(x, y, z, max_x, max_z)
        block_indices[idx] = get_palette_idx(block_id)

    # 位压缩
    long_array = generate_litematic_blocks(
        max_x, max_y, max_z, palette_name_list, block_indices)

    # 构建完整的 Litematica NBT
    import time
    now = int(time.time())

    root = [
        T_compound("Metadata", [
            T_string("Name", "Modern Villa"),
            T_string("Author", "Nova"),
            T_string("Description", "Modern style villa"),
            T_long("TimeCreated", now),
            T_long("TimeModified", now),
            T_int("TotalBlocks", len(blocks)),
            T_int("TotalVolume", total),
            T_list("EnclosingSize", 3, [max_x, max_y, max_z]),
        ]),
        T_list("Regions", TAG_COMPOUND, [
            T_compound(None, [
                T_string("Name", "Region_1"),
                T_pos("Position", 0, 0, 0),
                T_pos("Size", max_x, max_y, max_z),
                T_list("BlockStatePalette", TAG_COMPOUND, palette_nbt_list),
                T_long_array("BlockStates", long_array),
                T_list("TileEntities", TAG_COMPOUND, []),
                T_list("Entities", TAG_COMPOUND, []),
                T_list("PendingBlockTicks", TAG_COMPOUND, []),
                T_list("PendingFluidTicks", TAG_COMPOUND, []),
            ])
        ]),
        T_int("Version", 5),
    ]

    data = nbt_to_bytes(root)
    with open(path, "wb") as f:
        f.write(data)
    print(f"✅ {path} ({len(data)} bytes, {max_x}×{max_y}×{max_z})")


if __name__ == "__main__":
    print("🏗️  Modern Villa Generator")
    print("=" * 40)

    blocks = build_villa_blocks()
    palette_stats(blocks)

    print("\n📦 导出文件中...")
    export_create_schematic(blocks, "modern_villa.nbt")
    export_vanilla_nbt(blocks, "modern_villa_vanilla.nbt")
    export_litematic(blocks, "modern_villa.litematic")

    print("\n✨ 完成！可用 deepslate-mcp 渲染预览：")
    print("   render_structure({ nbt_path: 'modern_villa.nbt' })")
    print("   render_structure({ nbt_path: 'modern_villa_vanilla.nbt' })")
    print("   render_structure({ nbt_path: 'modern_villa.litematic' })")
