const fs = require('fs');
const path = require('path');

function patchDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      patchDirectory(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // Pattern 1: if (e.length > 0 && 0 === this.hashCount)
      if (content.includes('if (e.length > 0 && 0 === this.hashCount)')) {
        content = content.replace(
          /if \(e\.length > 0 && 0 === this\.hashCount\)/g,
          'if (false && e.length > 0 && 0 === this.hashCount)'
        );
        modified = true;
      }

      // Pattern 2: if (bitmap.length > 0 && 0 === this.hashCount)
      if (content.includes('if (bitmap.length > 0 && 0 === this.hashCount)')) {
        content = content.replace(
          /if \(bitmap\.length > 0 && 0 === this\.hashCount\)/g,
          'if (false && bitmap.length > 0 && 0 === this.hashCount)'
        );
        modified = true;
      }

      // Pattern 3: if (n < 0) throw new __PRIVATE_BloomFilterError(`Invalid hash count: ${n}`);
      // Also catch any other 0 === this.hashCount throwing BloomFilterError
      if (content.includes('0 === this.hashCount')) {
        content = content.replace(
          /if \([^)]*0 === this\.hashCount[^)]*\)\s*(?:\/\/.*?\n\s*)?throw new [^;]*BloomFilterError[^;]*;/g,
          '/* patched bloomfilter */'
        );
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`[Patch] Successfully patched BloomFilter in ${file}`);
      }
    }
  }
}

const firestoreDist = path.join(__dirname, '..', 'node_modules', '@firebase', 'firestore', 'dist');
if (fs.existsSync(firestoreDist)) {
  patchDirectory(firestoreDist);
  console.log('BloomFilter patching complete.');
} else {
  console.log('No @firebase/firestore/dist directory found to patch.');
}
