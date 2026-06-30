const fs = require('fs');
const content = fs.readFileSync('packages/server/src/db/client.ts', 'utf8');

// Find the migrationFiles array
const mfMatch = content.match(/const migrationFiles = \[([\s\S]*?)\];/);
if (mfMatch) {
  console.log('=== migrationFiles ===');
  console.log(mfMatch[0]);
}

// Find all MIGRATIONS keys
const keys = content.match(/'\d{3}_[\w-]+\.sql'/g);
if (keys) {
  console.log('\n=== MIGRATIONS keys (in order) ===');
  keys.forEach((k, i) => console.log(`${i}: ${k}`));
}

// Find the last MIGRATIONS entry (last 500 chars before the closing of MIGRATIONS)
const migStart = content.indexOf('const MIGRATIONS');
const migEndMatch = content.match(/\n\};\n/);
// Find the closing brace of MIGRATIONS
const afterMig = content.indexOf('\nconst migrationFiles');
if (afterMig > 0) {
  console.log('\n=== Last 600 chars before migrationFiles ===');
  console.log(content.substring(afterMig - 600, afterMig));
}
