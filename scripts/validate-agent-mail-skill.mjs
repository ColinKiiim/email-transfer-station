import {
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SKILL_SNIPPETS = [
  "Prefer the current tool's secret input",
  'process-scoped environment variable',
  'Never create a credential file by default',
  'Never place the JWT or site password in a URL, query string, command-line argument, or shell command',
  'Never print or echo a secret',
  'Send secret headers only to the configured `BASE` origin',
  'Do not follow an origin-changing redirect with secret headers',
  'without echoing the old one',
  'do not dump private mailbox bodies into logs',
  "Only perform a send, access request, or delete when the user's current request clearly authorizes that side effect",
  'Do not retry an ambiguous failed send automatically',
  'Report only the HTTP status and documented application error code',
  'Do not copy credentials into the temporary directory',
];

const addIssue = (issues, rule) => {
  if (!issues.includes(rule)) issues.push(rule);
};

export function validateSkillText(source) {
  const text = String(source).replaceAll('\r\n', '\n');
  const issues = [];
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);

  if (!frontmatter) {
    addIssue(issues, 'frontmatter:missing');
  } else {
    if (!/^name: email-transfer-station-agent-mail$/m.test(frontmatter[1])) {
      addIssue(issues, 'frontmatter:name');
    }
    if (!/^description: .*user-supplied Address JWT.*does not .*persist credentials automatically.*$/m.test(frontmatter[1])) {
      addIssue(issues, 'frontmatter:credential-boundary');
    }
  }

  for (const snippet of REQUIRED_SKILL_SNIPPETS) {
    if (!text.includes(snippet)) addIssue(issues, `required:${snippet}`);
  }

  for (const match of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    if (/\b(?:JWT|SITE_PASSWORD)\b|Authorization\s*:/i.test(match[1])) {
      addIssue(issues, 'forbidden:secret-in-code-block');
    }
  }

  const sensitiveName = String.raw`(?:\$\{?(?:JWT|SITE_PASSWORD)\}?|\$env:(?:JWT|SITE_PASSWORD)|%(?:JWT|SITE_PASSWORD)%|Authorization)`;
  const outputCommand = new RegExp(
    String.raw`\b(?:echo|printf|Write-Output|Write-Host|console\.log)\b[^\n]*${sensitiveName}`,
    'i',
  );
  const persistenceCommand = new RegExp(
    String.raw`\b(?:Set-Content|Out-File|tee|writeFile(?:Sync)?|appendFile(?:Sync)?)\b[^\n]*${sensitiveName}`,
    'i',
  );

  if (outputCommand.test(text)) addIssue(issues, 'forbidden:secret-output-command');
  if (persistenceCommand.test(text)) addIssue(issues, 'forbidden:secret-persistence-command');
  if (/(?:^|\s)(?:(?:export|set)\s+(?:JWT|SITE_PASSWORD)\s*=|\$env:(?:JWT|SITE_PASSWORD)\s*=)/im.test(text)) {
    addIssue(issues, 'forbidden:secret-shell-assignment');
  }
  if (/[?&](?:jwt|token|credential)=/i.test(text)) addIssue(issues, 'forbidden:credential-query');
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(text)) {
    addIssue(issues, 'forbidden:jwt-like-literal');
  }
  if (/\b(?:credential|token|jwt)s?\.(?:env|json|txt)\b/i.test(text)) {
    addIssue(issues, 'forbidden:credential-file-example');
  }

  return issues;
}

const read = (root, path) => readFileSync(resolve(root, path), 'utf8');

export function validateRepository(root) {
  const issues = validateSkillText(read(root, 'skills/email-transfer-station-agent-mail/SKILL.md'));
  const skillEntries = readdirSync(resolve(root, 'skills/email-transfer-station-agent-mail')).sort();
  if (skillEntries.length !== 1 || skillEntries[0] !== 'SKILL.md') {
    addIssue(issues, 'repository:skill-must-remain-instruction-only');
  }

  const discoveryPath = resolve(root, '.agents/skills');
  const discovery = lstatSync(discoveryPath);
  if (discovery.isSymbolicLink()) {
    if (readlinkSync(discoveryPath).replaceAll('\\', '/') !== '../skills') {
      addIssue(issues, 'repository:discovery-target');
    }
  } else if (!discovery.isFile() || readFileSync(discoveryPath, 'utf8').trim().replaceAll('\\', '/') !== '../skills') {
    addIssue(issues, 'repository:discovery-shape');
  }

  const agentGuide = read(root, 'AGENTS.md');
  const claudeGuide = read(root, 'CLAUDE.md');
  const workflow = read(root, '.github/workflows/ci.yml');
  const security = read(root, 'SECURITY.md');
  const testCommand = 'node --test scripts/validate-agent-mail-skill.test.mjs';
  const validationCommand = 'node scripts/validate-agent-mail-skill.mjs';

  if (!agentGuide.includes('skills/email-transfer-station-agent-mail/')) {
    addIssue(issues, 'repository:agent-canonical-skill');
  }
  if (!agentGuide.includes(testCommand) || !agentGuide.includes(validationCommand)) {
    addIssue(issues, 'repository:agent-validation-commands');
  }
  if (!claudeGuide.includes('[`AGENTS.md`](AGENTS.md)')) {
    addIssue(issues, 'repository:claude-authority-pointer');
  }
  if (!workflow.includes(testCommand) || !workflow.includes(validationCommand)) {
    addIssue(issues, 'repository:ci-validation-commands');
  }
  if (!security.includes('## Agent bearer credentials')) {
    addIssue(issues, 'repository:security-contract');
  }

  return issues;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let issues;
  try {
    issues = validateRepository(root);
  } catch {
    issues = ['repository:unreadable-contract-surface'];
  }

  if (issues.length > 0) {
    console.error('Agent credential contract failed:');
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log('Agent credential contract: passed (instruction-only Skill; discovery, docs, and CI aligned)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
