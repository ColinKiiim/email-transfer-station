import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { REQUIRED_SKILL_SNIPPETS, validateSkillText } from './validate-agent-mail-skill.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const currentSkill = readFileSync(
  resolve(root, 'skills/email-transfer-station-agent-mail/SKILL.md'),
  'utf8',
);

const hasRule = (source, rule) => validateSkillText(source).includes(rule);

test('current canonical Skill passes the credential-text contract', () => {
  assert.deepEqual(validateSkillText(currentSkill), []);
});

test('rejects a removed mandatory non-persistence clause', () => {
  const changed = currentSkill.replace(REQUIRED_SKILL_SNIPPETS[2], 'Credential handling is implementation-defined');
  assert.equal(hasRule(changed, `required:${REQUIRED_SKILL_SNIPPETS[2]}`), true);
});

test('rejects synthetic shell output and persistence examples', () => {
  const outputExample = `${currentSkill}\n\`\`\`sh\necho $JWT\n\`\`\`\n`;
  const powershellOutputExample = `${currentSkill}\n\`\`\`powershell\nWrite-Output $env:SITE_PASSWORD\n\`\`\`\n`;
  const persistenceExample = `${currentSkill}\n\`\`\`powershell\nSet-Content agent-secret.txt $JWT\n\`\`\`\n`;

  assert.equal(hasRule(outputExample, 'forbidden:secret-in-code-block'), true);
  assert.equal(hasRule(outputExample, 'forbidden:secret-output-command'), true);
  assert.equal(hasRule(powershellOutputExample, 'forbidden:secret-output-command'), true);
  assert.equal(hasRule(persistenceExample, 'forbidden:secret-in-code-block'), true);
  assert.equal(hasRule(persistenceExample, 'forbidden:secret-persistence-command'), true);
});

test('rejects synthetic query-string and JWT-like literals', () => {
  const canary = 'synthetic-sensitive-value';
  const queryExample = `${currentSkill}\nhttps://mail.example.test/api/settings?jwt=${canary}\n`;
  const syntheticJwt = [
    'eyJjYW5hcnkxMjM',
    'eyJub3QtYS1zZWNyZXQxMjM',
    'c3ludGhldGljLWNhbmFyeTEyMw',
  ].join('.');
  const literalExample = `${currentSkill}\n${syntheticJwt}\n`;

  assert.equal(hasRule(queryExample, 'forbidden:credential-query'), true);
  assert.equal(hasRule(literalExample, 'forbidden:jwt-like-literal'), true);
  assert.equal(validateSkillText(queryExample).some((rule) => rule.includes(canary)), false);
});

test('rejects a synthetic shell environment assignment', () => {
  const changed = `${currentSkill}\n\`\`\`powershell\n$env:JWT = 'synthetic-canary'\n\`\`\`\n`;
  assert.equal(hasRule(changed, 'forbidden:secret-shell-assignment'), true);
});
