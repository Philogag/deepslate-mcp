/**
 * Loader for vanilla Minecraft structure `.nbt` files.
 *
 * A vanilla structure NBT has top-level `size` (NbtList<NbtInt> with
 * 3 entries), `palette` (NbtList<NbtCompound> — each is a BlockState
 * tag with `Name` and optional `Properties`), and `blocks` (NbtList
 * <NbtCompound> — each has `pos` and `state` palette index, plus
 * optional `nbt` block-entity data).
 *
 * `deepslate.Structure.fromNbt` already handles all of this, so the
 * loader is essentially a thin I/O wrapper around `NbtFile.read`.
 */
import { readFile } from 'node:fs/promises';
import { NbtFile, Structure } from 'deepslate';

export async function loadNbtStructure(path: string): Promise<Structure> {
  const buf = await readFile(path);
  // NbtFile.read auto-detects gzip / zlib / bedrock header.
  const nbt = NbtFile.read(new Uint8Array(buf));
  return Structure.fromNbt(nbt.root);
}
