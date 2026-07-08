import { loadLitematicStructure } from './src/structures/litematic_loader.js';
try {
  const s = await loadLitematicStructure('examples/fixtures/blocks-demo.litematic.txt');
  console.log('OK blocks:', s.getBlocks().length, 'size:', s.getSize());
} catch(e) {
  console.error('ERROR:', e.message);
}
