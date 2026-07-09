"""
Litematica 结构格式位压缩工具。

Litematica 使用 LongArray（64 位有符号整型数组）位压缩存储方块索引。
本模块提供位压缩/解压功能。

用法:
    from litematica_gen import generate_litematic_blocks
    
    palette = ["minecraft:air", "minecraft:stone", "minecraft:oak_planks"]
    blocks_yxz = [0, 0, 0, 0, 1, 1, 1, 1, ...]  # YXZ order
    long_array = generate_litematic_blocks(5, 5, 5, palette, blocks_yxz)
"""

import math
from typing import List


def generate_litematic_blocks(
    size_x: int,
    size_y: int,
    size_z: int,
    palette: List[str],
    blocks_yxz: List[int],
) -> List[int]:
    """生成 Litematica 的 BlockStates LongArray。
    
    Args:
        size_x: X 轴尺寸
        size_y: Y 轴尺寸
        size_z: Z 轴尺寸
        palette: 方块调色板列表（如 ["minecraft:air", "minecraft:stone"]）
        blocks_yxz: YXZ 顺序的 palette 索引列表
    
    Returns:
        有符号 64 位整型数组（Java long[] 格式），可直接写入 Litematica NBT
    """
    palette_size = len(palette)
    bits = max(2, math.ceil(math.log2(palette_size)))
    total_bits = len(blocks_yxz) * bits
    num_longs = math.ceil(total_bits / 64)

    longs = [0] * num_longs
    for i, val in enumerate(blocks_yxz):
        bit_offset = i * bits
        arr_idx = bit_offset // 64
        inner = bit_offset % 64
        longs[arr_idx] |= (val & ((1 << bits) - 1)) << inner
        if inner + bits > 64:
            carry = val >> (64 - inner)
            longs[arr_idx + 1] |= carry

    # 转为 Java 有符号 64 位 int
    signed_longs = []
    for l in longs:
        if l >= (1 << 63):
            signed_longs.append(l - (1 << 64))
        else:
            signed_longs.append(l)
    return signed_longs


def bit_size(palette_size: int) -> int:
    """计算 Litematica 位压缩所需的 bits 数。
    
    bits = max(2, ceil(log2(palette_size)))
    """
    return max(2, math.ceil(math.log2(palette_size)))


def yxz_index(x: int, y: int, z: int,
              size_x: int, size_z: int) -> int:
    """计算 YXZ 顺序的索引。
    
    YXZ 索引顺序（x 最内层，y 最外层）:
        index = y * size_z * size_x + z * size_x + x
    """
    return y * size_z * size_x + z * size_x + x


def unpack_litematic_blocks(
    block_states: List[int],
    palette_size: int,
    total_blocks: int,
) -> List[int]:
    """解压 Litematica 的 BlockStates LongArray 回 palette 索引列表。
    
    Args:
        block_states: 有符号 64 位整型数组
        palette_size: 调色板大小
        total_blocks: 预期的方块总数
    
    Returns:
        palette 索引列表（YXZ 顺序）
    """
    bits = bit_size(palette_size)
    mask = (1 << bits) - 1
    result = [0] * total_blocks

    # 将 Java signed longs 转回无符号
    unsigned = [v & 0xFFFFFFFFFFFFFFFF for v in block_states]

    for i in range(total_blocks):
        bit_offset = i * bits
        arr_idx = bit_offset // 64
        inner = bit_offset % 64
        # 从当前 long 取 bits
        val = (unsigned[arr_idx] >> inner) & mask
        if inner + bits > 64:
            # 从下一个 long 取剩余位
            remaining = inner + bits - 64
            val |= (unsigned[arr_idx + 1] & ((1 << remaining) - 1)) << (bits - remaining)
        result[i] = val

    return result
