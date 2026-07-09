"""
Create Mod 机械动力蓝图生成器。

基于 nbt_utils 构建符合机械动力 Schematic 格式的 .nbt 蓝图文件。

用法:
    from create_builder import CreateSchematic
    
    sc = CreateSchematic(10, 8, 10)
    sc.add_block(0, 0, 0, "minecraft:stone")
    sc.add_block(5, 2, 3, "create:cogwheel", {"axis": "x"})
    sc.add_schematic_entity(5, 2, 3, "create:cogwheel",
                            {"axis": "x"},
                            [T_string("id", "create:cogwheel")])
    sc.set_metadata(author="Nova", name="Demo")
    
    data = sc.build()
    with open("demo.nbt", "wb") as f:
        f.write(data)
"""

from typing import Dict, List, Optional
from nbt_utils import (
    T_compound, T_string, T_int, T_list, T_pos,
    T_block_state, nbt_to_bytes, NbtNode,
    TAG_COMPOUND, TAG_INT,
)


class CreateSchematic:
    """机械动力蓝图构建器。
    
    用法:
        1. 创建实例: sc = CreateSchematic(width, height, depth)
        2. 添加方块: sc.add_block(x, y, z, block_id, properties?, block_entity_nbt?)
        3. 添加机械动力实体: sc.add_schematic_entity(x, y, z, block_id, properties?, entity_nbt?)
        4. 设置元数据: sc.set_metadata(author, name, description)
        5. 输出: data = sc.build()
    """

    def __init__(self, width: int, height: int, depth: int):
        self.width = width
        self.height = height
        self.depth = depth
        self._blocks: List[tuple] = []  # [(kind, NbtNode)]
        self._palette_map: Dict[str, int] = {}
        self._palette_list: List[NbtNode] = []
        self._entities: List[NbtNode] = []
        self._schematic_entities: List[NbtNode] = []
        self._metadata: List[NbtNode] = []
        # 始终添加 air 作为 palette[0]
        self._add_to_palette("minecraft:air")

    def _palette_key(self, block_id: str,
                     props: Optional[Dict] = None) -> str:
        if props:
            return f"{block_id}@{sorted(props.items())}"
        return block_id

    def _add_to_palette(self, block_id: str,
                        properties: Optional[Dict] = None) -> int:
        key = self._palette_key(block_id, properties)
        if key not in self._palette_map:
            idx = len(self._palette_list)
            self._palette_map[key] = idx
            self._palette_list.append(
                T_block_state(None, block_id, properties))
            return idx
        return self._palette_map[key]

    def add_block(self, x: int, y: int, z: int,
                  block_id: str,
                  properties: Optional[Dict] = None,
                  block_entity_nbt: Optional[List[NbtNode]] = None):
        """添加一个方块到蓝图。
        
        Args:
            x, y, z: 方块坐标（结构本地坐标）
            block_id: 完整方块 ID（如 'minecraft:stone'）
            properties: 可选方块属性（如 {'facing': 'north'}）
            block_entity_nbt: 可选方块实体 NBT（如箱子内容）
        """
        state_idx = self._add_to_palette(block_id, properties)
        children = [
            T_pos("pos", x, y, z),
            T_int("state", state_idx),
        ]
        if block_entity_nbt:
            children.append(T_compound("nbt", block_entity_nbt))
        entry = T_compound(None, children)
        self._blocks.append(("normal", entry))

    def add_schematic_entity(self, x: int, y: int, z: int,
                              block_id: str,
                              properties: Optional[Dict] = None,
                              entity_nbt: Optional[List[NbtNode]] = None):
        """添加机械动力实体（部署器、活塞、轴承等）。
        
        Args:
            x, y, z: 实体位置
            block_id: 关联方块 ID
            properties: 可选方块属性
            entity_nbt: 实体完整 NBT 数据（必须包含 'id' 字段）
        """
        nbt_children = list(entity_nbt) if entity_nbt else []
        # 确保 id 字段存在
        has_id = any(
            child[0] == 8 and child[1] == "id"
            for child in nbt_children
        )
        if not has_id:
            nbt_children.insert(0, T_string("id", block_id))

        entity_entry = T_compound(None, [
            T_pos("pos", x, y, z),
            T_compound("block", [
                T_string("Name", block_id),
                *(T_compound("Properties", [
                    T_string(k, v) for k, v in (properties or {}).items()
                ]) if properties else [])
            ]),
            T_compound("nbt", nbt_children),
        ])
        self._schematic_entities.append(entity_entry)

    def set_metadata(self, author: str = "",
                     name: str = "",
                     description: str = ""):
        """设置蓝图元数据（可选）。"""
        self._metadata = []
        if author:
            self._metadata.append(T_string("author", author))
        if name:
            self._metadata.append(T_string("name", name))
        if description:
            self._metadata.append(T_string("description", description))

    def build(self) -> bytes:
        """构建蓝图，返回 GZip 压缩的 NBT 字节。"""
        block_entries = [entry for _, entry in self._blocks]

        root: List[NbtNode] = [
            T_pos("size", self.width, self.height, self.depth),
            T_list("palette", TAG_COMPOUND, self._palette_list),
            T_list("blocks", TAG_COMPOUND, block_entries),
            T_list("entities", TAG_COMPOUND, self._entities),
            T_list("schematic_entities", TAG_COMPOUND,
                   self._schematic_entities),
            T_int("version", 1),
        ]
        if self._metadata:
            root.append(T_compound("metadata", self._metadata))

        return nbt_to_bytes(root)


def create_gearbox_demo():
    """生成一个包含齿轮传动的机械动力演示蓝图。"""
    sc = CreateSchematic(5, 3, 5)

    # 底座：圆石
    for x in range(5):
        for z in range(5):
            sc.add_block(x, 0, z, "minecraft:cobblestone")

    # 框架：安山岩外壳
    for y in range(1, 3):
        for x in range(5):
            for z in (0, 4):
                sc.add_block(x, y, z, "create:andesite_casing")
        for z in range(5):
            for x in (0, 4):
                sc.add_block(x, y, z, "create:andesite_casing")

    # 齿轮
    sc.add_block(2, 1, 2, "create:brass_casing")
    sc.add_block(2, 1, 1, "create:cogwheel", {"axis": "x"})
    sc.add_block(2, 1, 3, "create:cogwheel", {"axis": "x"})
    sc.add_block(1, 1, 2, "create:shaft", {"axis": "z"})
    sc.add_block(3, 1, 2, "create:shaft", {"axis": "z"})

    # 部署器
    sc.add_block(2, 2, 0, "create:deployer", {"facing": "north"})

    # 部署器实体 (schematic_entity)
    sc.add_schematic_entity(2, 2, 0, "create:deployer",
        {"facing": "north"},
        [
            T_string("id", "create:deployer"),
            T_string("facing", "north"),
            T_int("animation", 0),
            T_compound("heldItem", []),
        ])

    sc.set_metadata(author="Nova", name="Gearbox Demo",
                    description="A simple brass gearbox with deployer")

    data = sc.build()
    with open("gearbox_demo.nbt", "wb") as f:
        f.write(data)
    print(f"✅ gearbox_demo.nbt ({len(data)} bytes, "
          f"{sc.width}×{sc.height}×{sc.depth})")
    return data


if __name__ == "__main__":
    create_gearbox_demo()
