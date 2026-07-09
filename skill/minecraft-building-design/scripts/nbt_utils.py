"""
零外部依赖的 Minecraft NBT 序列化工具。

纯 Python 标准库实现 NBT (Named Binary Tag) 格式的序列化，
支持所有 NBT 标签类型：BYTE, SHORT, INT, LONG, FLOAT, DOUBLE,
BYTE_ARRAY, STRING, LIST, COMPOUND, INT_ARRAY, LONG_ARRAY。

适用于生成：
  - Vanilla NBT 结构 (.nbt)
  - Create Mod 蓝图 (.nbt)
  - Litematica 结构 (.litematic)

用法:
    from nbt_utils import T_compound, T_string, T_int, T_list, T_pos, nbt_to_bytes
"""

import gzip
import io
import struct
from typing import Dict, List, Optional, Tuple, Union

# ---- NBT Tag Types ----
TAG_END = 0
TAG_BYTE = 1
TAG_SHORT = 2
TAG_INT = 3
TAG_LONG = 4
TAG_FLOAT = 5
TAG_DOUBLE = 6
TAG_BYTE_ARRAY = 7
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10
TAG_INT_ARRAY = 11
TAG_LONG_ARRAY = 12

# Type alias: NbtNode = (tag_type, name_or_None, value)
# For TAG_COMPOUND: children is List[NbtNode]
# For TAG_LIST: value is (elem_tag_type, List[payloads])
NbtNode = Tuple[int, Optional[str], Union[None, int, float, str, bytes, list, tuple]]


# ---- Low-level serialization ----

def write_tag(buf: io.BytesIO, tag_type: int, name: Optional[str], value):
    """Write a single NBT tag (type + [name] + payload) to buffer."""
    if name is not None:
        buf.write(struct.pack('B', tag_type))
        _write_string(buf, name)
    _write_payload(buf, tag_type, value)


def _write_string(buf: io.BytesIO, s: str):
    encoded = s.encode('utf-8')
    buf.write(struct.pack('>h', len(encoded)))
    buf.write(encoded)


def _write_payload(buf: io.BytesIO, tag_type: int, value):
    if tag_type == TAG_END:
        pass
    elif tag_type == TAG_BYTE:
        buf.write(struct.pack('b', 1 if value else 0))
    elif tag_type == TAG_SHORT:
        buf.write(struct.pack('>h', value))
    elif tag_type == TAG_INT:
        buf.write(struct.pack('>i', value))
    elif tag_type == TAG_LONG:
        buf.write(struct.pack('>q', value))
    elif tag_type == TAG_FLOAT:
        buf.write(struct.pack('>f', value))
    elif tag_type == TAG_DOUBLE:
        buf.write(struct.pack('>d', value))
    elif tag_type == TAG_STRING:
        _write_string(buf, value)
    elif tag_type == TAG_BYTE_ARRAY:
        buf.write(struct.pack('>i', len(value)))
        buf.write(bytes(value))
    elif tag_type == TAG_INT_ARRAY:
        buf.write(struct.pack('>i', len(value)))
        for v in value:
            buf.write(struct.pack('>i', v))
    elif tag_type == TAG_LONG_ARRAY:
        buf.write(struct.pack('>i', len(value)))
        for v in value:
            buf.write(struct.pack('>q', v))
    elif tag_type == TAG_LIST:
        if len(value) == 0:
            buf.write(struct.pack('B', 0))
            buf.write(struct.pack('>i', 0))
        else:
            elem_type, items = value
            buf.write(struct.pack('B', elem_type))
            buf.write(struct.pack('>i', len(items)))
            for item in items:
                if elem_type in (TAG_COMPOUND,):
                    # item is a full NbtNode (tag_type, name, payload)
                    # extract just the payload (children list) for TAG_LIST
                    _write_payload(buf, elem_type, item[2])
                else:
                    _write_payload(buf, elem_type, item)
    elif tag_type == TAG_COMPOUND:
        for child_tag_type, child_name, child_value in value:
            write_tag(buf, child_tag_type, child_name, child_value)
        write_tag(buf, TAG_END, None, None)


# ---- Convenient NBT node builders ----

def T_byte(name: Optional[str], v: int) -> NbtNode:
    return (TAG_BYTE, name, v)

def T_short(name: Optional[str], v: int) -> NbtNode:
    return (TAG_SHORT, name, v)

def T_int(name: Optional[str], v: int) -> NbtNode:
    return (TAG_INT, name, v)

def T_long(name: Optional[str], v: int) -> NbtNode:
    return (TAG_LONG, name, v)

def T_float(name: Optional[str], v: float) -> NbtNode:
    return (TAG_FLOAT, name, v)

def T_double(name: Optional[str], v: float) -> NbtNode:
    return (TAG_DOUBLE, name, v)

def T_string(name: Optional[str], v: str) -> NbtNode:
    return (TAG_STRING, name, v)

def T_byte_array(name: Optional[str], v: bytes) -> NbtNode:
    return (TAG_BYTE_ARRAY, name, v)

def T_int_array(name: Optional[str], v: list) -> NbtNode:
    return (TAG_INT_ARRAY, name, v)

def T_long_array(name: Optional[str], v: list) -> NbtNode:
    return (TAG_LONG_ARRAY, name, v)

def T_list(name: Optional[str], elem_type: int, items: list) -> NbtNode:
    """Create a TAG_List node.
    
    Args:
        name: Tag name (None for anonymous)
        elem_type: Element tag type (e.g. TAG_COMPOUND, TAG_INT)
        items: List of payload values
    """
    return (TAG_LIST, name, (elem_type, items))

def T_compound(name: Optional[str], children: List[NbtNode]) -> NbtNode:
    """Create a TAG_Compound node."""
    return (TAG_COMPOUND, name, children)


# ---- Domain-specific builders ----

def T_block_state(name: Optional[str], block_id: str,
                  properties: Optional[Dict[str, str]] = None) -> NbtNode:
    """Create a block state NbtCompound: {Name, Properties?}
    
    Args:
        name: Tag name (None for palette entries)
        block_id: Full block ID (e.g. 'minecraft:oak_planks')
        properties: Optional block properties dict (e.g. {'facing': 'north'})
    """
    children: List[NbtNode] = [T_string("Name", block_id)]
    if properties:
        props = [T_string(k, v) for k, v in properties.items()]
        children.append(T_compound("Properties", props))
    return (TAG_COMPOUND, name, children)


def T_pos(name: str, x: int, y: int, z: int) -> NbtNode:
    """Create a position TAG_List of 3 ints: [x, y, z]"""
    return T_list(name, TAG_INT, [x, y, z])


# ---- Serialization entry points ----

def nbt_to_bytes(root_children: List[NbtNode],
                 root_name: str = "",
                 compressed: bool = True) -> bytes:
    """Serialize NBT root compound to bytes.
    
    Args:
        root_children: List of NbtNode for the root compound
        root_name: Root tag name (usually empty string)
        compressed: Whether to GZip compress (True for .nbt/.litematic)
    
    Returns:
        Bytes suitable for writing to a .nbt / .litematic file
    """
    buf = io.BytesIO()
    write_tag(buf, TAG_COMPOUND, root_name, root_children)
    
    if compressed:
        out = io.BytesIO()
        with gzip.GzipFile(fileobj=out, mode='wb', mtime=0) as f:
            f.write(buf.getvalue())
        return out.getvalue()
    
    return buf.getvalue()


def nbt_to_file(root_children: List[NbtNode],
                path: str,
                root_name: str = "",
                compressed: bool = True):
    """Serialize and write NBT to file.
    
    Args:
        root_children: List of NbtNode for the root compound
        path: Output file path
        root_name: Root tag name
        compressed: Whether to GZip compress
    """
    data = nbt_to_bytes(root_children, root_name, compressed)
    with open(path, "wb") as f:
        f.write(data)
