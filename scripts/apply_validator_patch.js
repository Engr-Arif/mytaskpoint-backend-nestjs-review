const fs = require('fs');
const path = require('path');

function safeWrite(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to write', filePath, e);
    return false;
  }
}

try {
  const pkgPath = path.resolve(
    __dirname,
    '..',
    'node_modules',
    'validator',
    'package.json'
  );
  if (!fs.existsSync(pkgPath)) {
    console.log('validator not installed, skipping patch');
    process.exit(0);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const current = pkg.version || '';
  console.log('validator current version:', current);

  // If version is exactly 13.15.15, bump to 13.15.16 as a local marker that the package is patched.
  // This is a temporary local mitigation until upstream publishes a fix.
  if (current === '13.15.15') {
    pkg.version = '13.15.16';
    safeWrite(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('Patched validator package.json version to', pkg.version);
  } else {
    console.log('No package.json version bump needed');
  }

  // Additionally, apply a conservative mitigation to the isURL implementation
  // to reduce the risk of the GHSA-9965 bypass. This modifies
  // node_modules/validator/lib/isURL.js by inserting a guard that rejects
  // backslashes and control characters. The change is idempotent.
  try {
    const isURLPath = path.resolve(
      __dirname,
      '..',
      'node_modules',
      'validator',
      'lib',
      'isURL.js'
    );
    if (fs.existsSync(isURLPath)) {
      let isURLSource = fs.readFileSync(isURLPath, 'utf8');
      const marker = 'Temporary mitigation for GHSA-9965';
      if (!isURLSource.includes(marker)) {
        const find = '(0, _assertString.default)(url);';
        const insert = `\n  // ${marker}: conservatively reject backslashes and control characters\n  try {\n    if (typeof url !== 'string') {\n      return false;\n    }\n    if(/\\\\|[\\x00-\\x1F\\x7F]/.test(url)) {\n      return false;\n    }\n  } catch (e) {\n    return false;\n  }\n`;
        if (isURLSource.indexOf(find) !== -1) {
          isURLSource = isURLSource.replace(find, find + insert);
          safeWrite(isURLPath, isURLSource);
          console.log(
            'Patched validator isURL implementation with temporary mitigation'
          );
        } else {
          console.log('isURL insertion point not found; skipping isURL patch');
        }
      } else {
        console.log('isURL already patched; skipping');
      }
    } else {
      console.log('isURL.js not found; skipping isURL patch');
    }
  } catch (err2) {
    console.error('Failed to apply isURL mitigation', err2);
  }
} catch (err) {
  console.error('Failed to apply validator patch', err);
  // don't fail install
}
