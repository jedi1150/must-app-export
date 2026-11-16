import fs from 'node:fs';
import path from 'node:path';

const required = ['index.html', 'css/styles.css', 'js/main.js', 'js/exporters.js', '.nojekyll'];

for (const rel of required) {
  const full = path.resolve(rel);
  if (!fs.existsSync(full)) {
    console.error(`Missing required artifact: ${rel}`);
    process.exit(1);
  }
}

console.log('Static site build check passed.');