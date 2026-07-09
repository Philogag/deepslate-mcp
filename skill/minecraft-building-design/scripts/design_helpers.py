"""
建筑设计辅助函数。

提供立方体填充、中空构造、镜像、旋转等常用建筑操作。
可以操作 dict-based 方块集合或 CreateSchematic 实例。

用法:
    from design_helpers import fill_cuboid, hollow_cuboid, palette_stats
    
    # 在 dict 上操作
    blocks = {}
    fill_cuboid(blocks, 0, 0, 0, 10, 5, 8, "minecraft:stone")
    palette_stats(blocks)
"""

from typing import Dict, Optional, Tuple, Union
from collections import Counter


# ---- Dict-based operations ----

def fill_cuboid(
    blocks: Dict[Tuple[int, int, int], Union[str, Tuple]],
    x1: int, y1: int, z1: int,
    x2: int, y2: int, z2: int,
    block_id: str,
    properties: Optional[Dict[str, str]] = None,
):
    """填充一个立方体区域。
    
    Args:
        blocks: {(x,y,z): block_id} 字典
        x1,y1,z1: 起始坐标（含）
        x2,y2,z2: 结束坐标（含）
        block_id: 方块 ID
        properties: 可选方块属性
    """
    for x in range(min(x1, x2), max(x1, x2) + 1):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            for z in range(min(z1, z2), max(z1, z2) + 1):
                if properties:
                    blocks[(x, y, z)] = (block_id, properties)
                else:
                    blocks[(x, y, z)] = block_id


def hollow_cuboid(
    blocks: Dict[Tuple[int, int, int], Union[str, Tuple]],
    x1: int, y1: int, z1: int,
    x2: int, y2: int, z2: int,
    wall: str,
    floor: Optional[str] = None,
    roof: Optional[str] = None,
    wall_properties: Optional[Dict[str, str]] = None,
):
    """中空长方体：外墙、地板、屋顶可用不同方块。
    
    Args:
        blocks: 方块字典
        x1,y1,z1: 起始坐标
        x2,y2,z2: 结束坐标
        wall: 墙壁方块
        floor: 地板方块（默认同 wall）
        roof: 屋顶方块（默认同 wall）
        wall_properties: 墙壁方块属性
    """
    if floor is None:
        floor = wall
    if roof is None:
        roof = wall

    # 地板
    fill_cuboid(blocks, x1, y1, z1, x2, y1, z2, floor)
    # 屋顶
    fill_cuboid(blocks, x1, y2, z1, x2, y2, z2, roof)
    # 墙壁（四边）
    for y in range(min(y1, y2) + 1, max(y1, y2)):
        for x in range(min(x1, x2), max(x1, x2) + 1):
            blocks[(x, y, min(z1, z2))] = (wall, wall_properties) if wall_properties else wall
            blocks[(x, y, max(z1, z2))] = (wall, wall_properties) if wall_properties else wall
        for z in range(min(z1, z2), max(z1, z2) + 1):
            blocks[(min(x1, x2), y, z)] = (wall, wall_properties) if wall_properties else wall
            blocks[(max(x1, x2), y, z)] = (wall, wall_properties) if wall_properties else wall


# ---- Symmetry operations ----

def apply_mirror_x(
    blocks: Dict[Tuple[int, int, int], Union[str, Tuple]],
    width: int,
) -> Dict[Tuple[int, int, int], Union[str, Tuple]]:
    """X 轴对称镜像。
    
    Args:
        blocks: 原方块字典
        width: X 轴方向总宽度
    
    Returns:
        新方块字典（包含原有和镜像后的方块）
    """
    new_blocks = dict(blocks)
    for (x, y, z), val in list(blocks.items()):
        mx = width - 1 - x
        if mx != x and (mx, y, z) not in blocks:
            new_blocks[(mx, y, z)] = val
    return new_blocks


def apply_mirror_z(
    blocks: Dict[Tuple[int, int, int], Union[str, Tuple]],
    depth: int,
) -> Dict[Tuple[int, int, int], Union[str, Tuple]]:
    """Z 轴对称镜像。"""
    new_blocks = dict(blocks)
    for (x, y, z), val in list(blocks.items()):
        mz = depth - 1 - z
        if mz != z and (x, y, mz) not in blocks:
            new_blocks[(x, y, mz)] = val
    return new_blocks


def apply_rotate_y(
    blocks: Dict[Tuple[int, int, int], Union[str, Tuple]],
    width: int,
    depth: int,
) -> Dict[Tuple[int, int, int], Union[str, Tuple]]:
    """Y 轴 90° 顺时针旋转。
    
    Args:
        blocks: 原方块字典
        width: X 轴尺寸
        depth: Z 轴尺寸
    
    Returns:
        旋转后的方块字典
    """
    new_blocks = {}
    for (x, y, z), val in blocks.items():
        new_blocks[(z, y, width - 1 - x)] = val
    return new_blocks


# ---- Analysis ----

def palette_stats(blocks: Dict[Tuple[int, int, int], Union[str, Tuple]]):
    """统计方块调色板并打印。
    
    Args:
        blocks: 方块字典
    """
    counts = Counter()
    for val in blocks.values():
        if isinstance(val, tuple):
            counts[val[0]] += 1
        else:
            counts[val] += 1

    print("方块统计:")
    for bid, num in counts.most_common():
        print(f"  {bid}: {num}")
    print(f"总计: {len(blocks)} 方块, {len(counts)} 种")
    return counts


def fill_cylinder(
    blocks: Dict[Tuple[int, int, int], Union[str, Tuple]],
    cx: int, cz: int,
    y1: int, y2: int,
    radius: float,
    block_id: str,
    properties: Optional[Dict[str, str]] = None,
):
    """填充圆柱体区域。
    
    Args:
        blocks: 方块字典
        cx, cz: 中心 X/Z 坐标
        y1, y2: Y 轴起止
        radius: 半径
        block_id: 方块 ID
        properties: 可选属性
    """
    r2 = radius * radius
    r_min = int(cx - radius) - 1
    r_max = int(cx + radius) + 1
    for x in range(r_min, r_max + 1):
        for z in range(r_min, r_max + 1):
            if (x - cx) ** 2 + (z - cz) ** 2 <= r2:
                for y in range(min(y1, y2), max(y1, y2) + 1):
                    if properties:
                        blocks[(x, y, z)] = (block_id, properties)
                    else:
                        blocks[(x, y, z)] = block_id


# ---- CreateSchematic bridge ----

def fill_cuboid_sc(sc, x1, y1, z1, x2, y2, z2, block_id,
                   properties=None):
    """在 CreateSchematic 实例上填充立方体。
    
    用法:
        from create_builder import CreateSchematic
        sc = CreateSchematic(10, 5, 10)
        fill_cuboid_sc(sc, 0, 0, 0, 9, 0, 9, "minecraft:stone")
    """
    for x in range(min(x1, x2), max(x1, x2) + 1):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            for z in range(min(z1, z2), max(z1, z2) + 1):
                sc.add_block(x, y, z, block_id, properties)
