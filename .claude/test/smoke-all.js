/**
 * Smoke Test Runner
 * Executes all smoke tests in sequence and reports overall results.
 *
 * Usage: cd .claude/skills/playwright && node run.js /Users/s/claude-os/.claude/test/smoke-all.js
 */
const { execSync } = require('child_process');
const path = require('path');

// Self-contained async IIFE so run.js passes this through unchanged
(async () => {
  const SKILL_DIR = '/Users/s/claude-os/.claude/skills/playwright';
  const TEST_DIR = '/Users/s/claude-os/.claude/test';

  const TESTS = [
    { file: 'smoke-desktop.js', name: 'Desktop' },
    { file: 'smoke-apps.js', name: 'Apps' },
    { file: 'smoke-widgets.js', name: 'Widgets' },
  ];

  console.log('=== Dashboard Smoke Test Suite ===\n');

  const results = [];

  for (const test of TESTS) {
    const scriptPath = path.join(TEST_DIR, test.file);
    console.log(`--- ${test.name} ---`);

    try {
      const output = execSync(
        `node run.js "${scriptPath}"`,
        {
          cwd: SKILL_DIR,
          timeout: 120000,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );
      console.log(output);
      results.push({ name: test.name, passed: true });
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || '');
      console.log(output);
      results.push({ name: test.name, passed: false, error: output.split('\n').filter(l => l.includes('FAIL')).join('; ') || 'Unknown' });
    }

    console.log('');
  }

  // Summary
  console.log('=== Summary ===');
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(r => {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}: ${r.name}${!r.passed && r.error ? ` (${r.error.substring(0, 100)})` : ''}`);
  });

  console.log(`\n${passed}/${total} smoke tests passed`);

  if (passed === total) {
    console.log('\nRESULT: ALL PASS');
    process.exit(0);
  } else {
    console.log('\nRESULT: SOME FAILED');
    process.exit(1);
  }
})();
