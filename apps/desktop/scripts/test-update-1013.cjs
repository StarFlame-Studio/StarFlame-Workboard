// Run from any directory: node --test apps/desktop/scripts/test-update-1013.cjs
// Uses real historical updater.ts, electron-updater, YAML, HTTP and cache files.
// Electron shell/timers and process spawn are test doubles; no Wine/Windows execution.
'use strict'
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { EventEmitter, once } = require('node:events')
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises')
const http = require('node:http')
const { createRequire } = require('node:module')
const { tmpdir } = require('node:os')
const { basename, join, resolve } = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const { gzipSync } = require('node:zlib')
const ts = require('typescript')
const { NsisUpdater } = require('electron-updater/out/NsisUpdater.js')
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor.js')
const { GenericProvider } = require('electron-updater/out/providers/GenericProvider.js')
const updaterRequire = createRequire(require.resolve('electron-updater/package.json'))
const { CURRENT_APP_INSTALLER_FILE_NAME } = updaterRequire('builder-util-runtime')
const { dump } = updaterRequire('js-yaml')
const root = resolve(__dirname, '../../..')
const updaterPath = 'apps/desktop/src/main/updater.ts'
const digest = (bytes) => createHash('sha512').update(bytes).digest('base64')
const noOp = () => {}
const loopback = '127.0.0.1'
// 0455177 (1.2.1/1011), 728db8e (1.2.1/1012), and 48e27cd (1.2.2/1012)
// have this identical updater.ts Git blob and all pin electron-updater 6.8.11.
// Load only the published baseline so a full clone does not need the unpublished 48e27cd.
const historicalRef = '728db8e3158aa95076c4109d5bb5be6ea96cefd2'
const historicalBlob = 'feff7827b6d6a6b8786aada5e7d69a48db541b26'
const historicalObject = historicalRef + ':' + updaterPath
const sourceGit = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
assert.equal(sourceGit(['rev-parse', historicalObject]).trim(), historicalBlob)
assert.equal(require('electron-updater/package.json').version, '6.8.11')
const historicalSource = sourceGit(['show', historicalObject])
const history = [
  { ref: historicalRef, version: '1.2.1', code: 1011, channel: 'win7-ia32', mode: 'delta' },
  { ref: historicalRef, version: '1.2.1', code: 1012, channel: 'win10-ia32', mode: 'bad-range' },
  { ref: historicalRef, version: '1.2.2', code: 1012, channel: 'win10-x64', mode: 'no-cache' },
]
const oldParts = [Buffer.from('common installer bytes'), Buffer.from('1012-old')]
const newParts = [oldParts[0], Buffer.from('1013-new')]
const target = Buffer.concat(newParts)
const blockmap = (parts) => gzipSync(JSON.stringify({ version: '2', files: [{
  name: 'file', offset: 0, sizes: parts.map((part) => part.length), checksums: parts.map(digest),
}] }))

class LoopbackHttpExecutor extends ElectronHttpExecutor {
  createRequest(options, callback) {
    assert.equal(options.hostname, '127.0.0.1', 'test must never reach an external service')
    return http.request(options, callback)
  }
}

function loadSource(source, autoUpdater, build, dir) {
  const pendingTimers = new Map()
  let timerId = 0
  const addTimer = (fn, delay) => (pendingTimers.set(++timerId, { fn, delay }), timerId)
  const removeTimer = (id) => pendingTimers.delete(id)
  const takeTimer = (delay) => {
    const row = [...pendingTimers].find(([, item]) => item.delay === delay)
    assert.ok(row, 'expected a timer scheduled after ' + delay + ' ms')
    pendingTimers.delete(row[0])
    return row[1].fn
  }
  const lifecycle = []
  const app = {
    isPackaged: true,
    isReady: () => true,
    getVersion: () => build.version,
    getPath: (name) => name === 'exe' ? join(dir, 'StarflameWorkboard.exe') : dir,
  }
  const stubs = {
    electron: { app, powerMonitor: new EventEmitter() },
    'electron-updater': { autoUpdater },
    './env': { APP_VERSION_CODE: build.code },
    './window': { getMainWindow: () => null },
    './appState': { setQuitting: (value) => lifecycle.push(['setQuitting', value]) },
    './updateSchedule': { evaluateUpdateWindow: () => ({ paused: false }), setUpdateScheduleChangeListener: noOp, setUpdateScheduleLogger: noOp },
    'node:fs/promises': { statfs: async () => ({ bavail: 1024 * 1024, bsize: 1024 }) },
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, require: (name) => stubs[name] ?? require(name), console: { log: noOp, error: noOp },
    setTimeout: addTimer, clearTimeout: removeTimer, setInterval: addTimer, clearInterval: removeTimer,
  }, { filename: updaterPath + '@' + build.ref })
  exports.setupAutoUpdate()
  return { api: exports, takeTimer, lifecycle }
}

for (const build of history) {
  test(build.version + '/' + build.code + ' → 1.2.1/1013 via ' + build.mode, { timeout: 10000 }, async (t) => {
    const work = await mkdtemp(join(tmpdir(), 'starflame-update-1013-'))
    t.after(() => rm(work, { recursive: true, force: true }))
    const dir = '/desktop/' + build.channel + '/'
    const name = 'StarflameWorkboard-1.2.1-1013-' + (build.channel.endsWith('x64') ? 'x64' : 'ia32') + '.exe'
    const files = [{ url: name, sha512: digest(target), size: target.length }]
    // Deliberately different legacy path: the real provider must prioritize files[].url.
    const legacyName = 'legacy-overwritten.exe'
    let manifest = { version: '1.2.1', files, path: legacyName, sha512: files[0].sha512 }
    const requests = []
    const server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname
      requests.push([pathname, req.headers.range ?? null])
      if (pathname === dir + 'latest.yml') return res.end(dump(manifest))
      if (pathname === dir + name + '.blockmap') return res.end(blockmap(newParts))
      if (pathname === dir + name) {
        if (req.headers.range && build.mode === 'delta') {
          const offset = newParts[0].length
          res.writeHead(206, { 'Content-Range': 'bytes ' + offset + '-' + (target.length - 1) + '/' + target.length,
            'Content-Length': target.length - offset, 'Accept-Ranges': 'bytes' })
          return res.end(target.subarray(offset))
        }
        // Bad range serves 200 w/o Accept-Ranges, requiring a checksum-validated full retry.
        res.setHeader('Content-Length', target.length)
        return res.end(target)
      }
      res.writeHead(404)
      res.end('not found')
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    t.after(() => new Promise((done) => { server.close(done); server.closeAllConnections() }))
    const config = join(work, 'app-update.yml')
    const base = 'http://127.0.0.1:' + server.address().port + dir
    await writeFile(config, dump({ provider: 'generic', url: base, channel: 'latest', updaterCacheDirName: 'test-cache' }))
    const cacheDir = join(work, 'test-cache')
    if (build.mode !== 'no-cache') {
      await mkdir(cacheDir)
      await writeFile(join(cacheDir, 'current.blockmap'), blockmap(oldParts))
      await writeFile(join(cacheDir, CURRENT_APP_INSTALLER_FILE_NAME), Buffer.concat(oldParts))
    }
    const updater = new NsisUpdater(null, {
      version: build.version, isPackaged: true, whenReady: async () => {}, name: 'test-cache',
      appUpdateConfigPath: config, userDataPath: work, baseCachePath: work, onQuit: noOp,
    })
    updater.httpExecutor = new LoopbackHttpExecutor()
    const runtimeOptions = { platform: 'win32', executor: updater.httpExecutor, isUseMultipleRangeRequest: false }
    updater.createProviderRuntimeOptions = () => runtimeOptions
    const controller = loadSource(historicalSource, updater, build, work)
    t.after(() => controller.api.stopAutoUpdate())
    assert.equal(updater.allowDowngrade, false, 'build-code override does not need global semver downgrade')
    const provider = new GenericProvider({ provider: 'generic', url: base }, updater, runtimeOptions)
    const [file] = provider.resolveFiles(manifest)
    assert.equal(file.url.href, base + name)
    assert.equal(provider.resolveFiles({ ...manifest, files: [] })[0].url.href, base + legacyName)
    const [oldMap, newMap] = provider.getBlockMapFiles(file.url, build.version, manifest.version)
    assert.equal(newMap.href, base + name + '.blockmap')
    assert.equal(oldMap.href, base + name.replace('1.2.1', build.version) + '.blockmap')

    assert.equal((await controller.api.checkForUpdates()).state, 'not-available')
    manifest.versionCode = 'invalid'
    assert.equal((await controller.api.checkForUpdates()).state, 'not-available')
    manifest.versionCode = 1013
    manifest.stagingPercentage = 0
    assert.equal((await controller.api.checkForUpdates()).state, 'not-available')
    delete manifest.stagingPercentage
    updater.isUpdateSupported = () => false
    assert.equal((await controller.api.checkForUpdates()).state, 'not-available')
    updater.isUpdateSupported = () => true
    assert.equal(requests.filter(([path]) => path !== dir + 'latest.yml').length, 0)
    const downloaded = once(updater, 'update-downloaded')
    controller.takeTimer(6000)() // actual app startup timer runs the check without manual input
    const [event] = await downloaded
    assert.equal(basename(event.downloadedFile), name)
    assert.deepEqual(await readFile(event.downloadedFile), target)
    assert.equal(event.versionCode, 1013)
    const range = 'bytes=' + newParts[0].length + '-' + (target.length - 1)
    const installerRequests = requests.filter(([path]) => path === dir + name)
    assert.deepEqual(installerRequests.map(([, value]) => value),
      build.mode === 'delta' ? [range] : build.mode === 'bad-range' ? [range, null] : [null])
    assert.ok(requests.some(([path]) => path === newMap.pathname))
    if (build.mode === 'no-cache') assert.ok(requests.some(([path]) => path === oldMap.pathname))
    assert.ok(!requests.some(([path]) => path === dir + legacyName))

    // Observe real BaseUpdater/NsisUpdater args while intercepting OS spawn and Electron quit.
    const processLaunch = new Promise((done) => {
      updater.spawnLog = async (command, args) => { done({ command, args }) }
    })
    const realQuitAndInstall = updater.quitAndInstall.bind(updater)
    updater.quitAndInstall = (...args) => {
      assert.deepEqual(args, [true, true])
      assert.deepEqual(controller.lifecycle, [['setQuitting', true]])
      // BaseUpdater invokes Electron's native quit in setImmediate. Exercise the real install half.
      assert.ok(updater.install(...args))
    }
    controller.takeTimer(2000)()
    assert.deepEqual(await processLaunch, { command: event.downloadedFile, args: ['--updated', '/S', '--force-run'] })
    updater.quitAndInstall = realQuitAndInstall
  })
}

test('1.2.1/1013 rejects a stale higher-semver manifest with build 1012 or 1013', async (t) => {
  const work = await mkdtemp(join(tmpdir(), 'starflame-update-1013-'))
  t.after(() => rm(work, { recursive: true, force: true }))
  const source = await readFile(join(root, updaterPath), 'utf8')
  const constants = await readFile(join(root, 'packages/shared/src/constants.ts'), 'utf8')
  assert.match(constants, /export const APP_VERSION_CODE = 1013\b/)
  const build = { ref: 'working tree', version: '1.2.1', code: 1013 }
  const updater = new NsisUpdater(null, { version: build.version })
  const controller = loadSource(source, updater, build, work)
  t.after(() => controller.api.stopAutoUpdate())
  for (const versionCode of [1012, 1013]) {
    assert.equal(await updater.isUpdateAvailable({ version: '1.2.2', versionCode }), false)
  }
  assert.equal(await updater.isUpdateAvailable({ version: '1.2.2' }), true, 'legacy semver fallback remains')
  assert.equal(await updater.isUpdateAvailable({ version: '1.2.1', versionCode: 1014 }), true)
})
