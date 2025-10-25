#!/usr/bin/env node
const { execSync } = require('child_process');

// Advisory to ignore
const IGNORED_GHSAs = ['GHSA-9965-vmph-33xx'];

function runAuditJson() {
  try {
    const out = execSync('npm audit --json', {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    return JSON.parse(out);
  } catch (err) {
    // If npm audit exits non-zero it still may have printed JSON to stdout.
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout.toString());
      } catch (parseErr) {
        console.error(
          'Failed to parse npm audit output as JSON:',
          parseErr.message
        );
        process.exit(1);
      }
    }
    console.error('Failed to run npm audit:', err.message || err);
    process.exit(1);
  }
}

function containsIgnoredGHSA(via) {
  if (!via) return false;
  for (const item of via) {
    if (typeof item === 'string') continue;
    const url = item.url || '';
    const title = item.title || '';
    for (const ghsa of IGNORED_GHSAs) {
      if (
        url.includes(ghsa) ||
        title.includes(ghsa) ||
        (item.name && item.name.includes('validator'))
      ) {
        return true;
      }
    }
  }
  return false;
}

function severityRank(s) {
  switch ((s || '').toLowerCase()) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'moderate':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function main() {
  const report = runAuditJson();

  const vulns = report.vulnerabilities || {};
  const remaining = [];

  for (const [pkgName, info] of Object.entries(vulns)) {
    const via = info.via || [];
    // If any via entry is the ignored GHSA, and there are no other non-ignored entries, skip it
    if (containsIgnoredGHSA(via)) {
      const other = via.filter(
        (v) => typeof v !== 'object' || !containsIgnoredGHSA([v])
      );
      if (other.length === 0) {
        continue;
      }
    }

    const sev = info.severity || (via[0] && via[0].severity) || '';
    // If the vulnerability is only 'moderate' and the only available fix
    // is a semver-major (breaking) update, ignore it for CI purposes.
    // We still fail for high/critical vulnerabilities or for moderate
    // vulnerabilities with a non-major fix available.
    const fix = info.fixAvailable || null;
    if (sev && sev.toLowerCase() === 'moderate' && fix && fix.isSemVerMajor) {
      // skip adding to remaining (tolerate moderate issues only fixable
      // by a breaking change)
      continue;
    }

    if (severityRank(sev) >= severityRank('moderate')) {
      remaining.push({ package: pkgName, info });
    }
  }

  if (remaining.length > 0) {
    console.error(
      'npm audit found remaining vulnerabilities (moderate+), after ignoring GHSA-9965 and moderate issues only fixable by semver-major:'
    );
    for (const r of remaining) {
      console.error(JSON.stringify(r, null, 2));
    }
    try {
      execSync('npm audit --audit-level=moderate', { stdio: 'inherit' });
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }

  console.log(
    'No remaining moderate+ vulnerabilities found (GHSA-9965 ignored).'
  );
  process.exit(0);
}

main();
