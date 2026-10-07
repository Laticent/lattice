/**
 * lib/core/chrome-exec.js, the parts that need no browser: which homes are read and which cache
 * layouts count. On a windows-latest runner (PR #2459) every render warned "No Chrome binary
 * detected" and then rendered on puppeteer's own chrome-win64, because Windows sets USERPROFILE
 * rather than HOME and the scan knew no Windows build. The render path itself is
 * test/integration/export/chrome-path-resolution.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ownHomes, puppeteerCacheBrowsers } = require('../../../lib/core/chrome-exec.js');

describe('chrome-exec', () => {
  test('a Windows environment (USERPROFILE, no HOME) still names its home', () => {
    const homes = ownHomes({ USERPROFILE: 'C:\\Users\\runneradmin' }, () => 'C:\\Users\\runneradmin');
    assert.deepEqual(homes, ['C:\\Users\\runneradmin']);
  });

  test('HOME stays first, and the OS answer is read when neither variable is set', () => {
    assert.deepEqual(ownHomes({ HOME: '/home/a', USERPROFILE: '/u/b' }, () => '/home/a'), ['/home/a', '/u/b']);
    assert.deepEqual(ownHomes({}, () => '/var/empty'), ['/var/empty']);
    assert.deepEqual(ownHomes({}, () => { throw new Error('no passwd entry'); }), []);
  });

  test('the cache scan finds chrome-win64 on Windows, and each platform only its own build', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chrome-exec-'));
    try {
      const put = (...p) => {
        const f = path.join(home, '.cache', 'puppeteer', 'chrome', ...p);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, '');
        return f;
      };
      const win = put('win64-131.0.6778.85', 'chrome-win64', 'chrome.exe');
      const linux = put('linux-131.0.6778.85', 'chrome-linux64', 'chrome');
      put('win64-131.0.6778.85', 'chrome-win64', 'chrome_proxy.exe');
      const mac = put('mac_arm-131.0.6778.85', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      assert.deepEqual(puppeteerCacheBrowsers([home], 'win32'), [win]);
      assert.deepEqual(puppeteerCacheBrowsers([home], 'linux'), [linux], 'Linux never gets the chrome.exe that sorts after it');
      assert.deepEqual(puppeteerCacheBrowsers([home], 'darwin'), [mac]);
      assert.deepEqual(puppeteerCacheBrowsers([home], 'aix'), []);
      assert.deepEqual(puppeteerCacheBrowsers([path.join(home, 'missing')], 'win32'), []);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
