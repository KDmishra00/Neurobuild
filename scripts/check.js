const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const javascriptFiles = [
  'server.js',
  'services/ai.js',
  'routes/auth.js',
  'routes/generate.js',
  'routes/projects.js',
  'public/js/api.js'
];
const htmlFiles = [
  'frontend/dashboard.html',
  'frontend/login.html',
  'frontend/templates.html',
  'frontend/profile.html',
  'frontend/settings.html'
];

function checkJavascript(source, name) {
  execFileSync(process.execPath, ['--check', '-'], {
    input: source,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  console.log(`✓ ${name}`);
}

for (const file of javascriptFiles) {
  checkJavascript(fs.readFileSync(path.join(root, file), 'utf8'), file);
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => checkJavascript(match[1], `${file} script ${index + 1}`));
}
