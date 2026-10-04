import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath } from 'node:url'

const qaRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(qaRoot, '..', '..')
const productRoot = workspaceRoot
const outputRoot = join(workspaceRoot, 'output')
const inventoryPath = join(qaRoot, 'output-inventory.json')
const config = JSON.parse(readFileSync(join(qaRoot, 'qa.config.json'), 'utf8'))
const fixedActiveSources = [
  'AGENTS.md',
  'HANDOFF.md',
  'docs/CURRENT.md',
  'docs/INDEX.md',
]
const activeSources = discoverActiveSources()

const argv = process.argv.slice(2)
const command = argv.shift() || 'help'
const adminRequestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function slash(value) {
  return value.replaceAll('\\', '/')
}

function workspaceRelative(value) {
  return slash(relative(workspaceRoot, value))
}

function markdownFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(absolute)
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : []
  })
}

function linkedMarkdown(source) {
  const absolute = join(workspaceRoot, source)
  const linked = []
  for (const match of readFileSync(absolute, 'utf8').matchAll(/\]\((?:<)?([^\s)>#?]+\.md)(?:#[^)]*)?(?:>)?\)/gi)) {
    const target = resolve(dirname(absolute), match[1])
    const local = relative(workspaceRoot, target)
    const path = slash(local)
    if (!local || local.startsWith('..') || isAbsolute(local) || path.startsWith('archive/') || !existsSync(target)) continue
    linked.push(path)
  }
  return linked
}

function discoverActiveSources() {
  for (const source of fixedActiveSources) {
    if (!existsSync(join(workspaceRoot, source))) throw new Error(`active source is missing: ${source}`)
  }
  const explicit = [join(workspaceRoot, 'docs', 'plans'), join(workspaceRoot, 'docs', 'reviews')]
    .flatMap(markdownFiles)
    .filter((path) => /^\s*(?:[-*]\s*)?(?:\*\*)?status(?:\*\*)?\s*:\s*[`*]*active\b/im.test(readFileSync(path, 'utf8')))
    .map(workspaceRelative)
  const sources = new Set(fixedActiveSources)
  const scanned = new Set()
  const pending = ['docs/CURRENT.md', ...explicit]
  while (pending.length) {
    const source = pending.shift()
    if (scanned.has(source)) continue
    scanned.add(source)
    sources.add(source)
    for (const linked of linkedMarkdown(source)) {
      if (!sources.has(linked)) pending.push(linked)
    }
  }
  return [...sources].sort()
}

function option(name, fallback = '') {
  const index = argv.indexOf(name)
  if (index < 0) return fallback
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function flag(name) {
  return argv.includes(name)
}

function validateConfig() {
  const base = new URL(config.defaultBaseUrl)
  if (base.protocol !== 'https:' && !isLoopback(base)) throw new Error('defaultBaseUrl must use HTTPS unless it is loopback')
  if (config.adminApiPrefix !== '/api/admin/') throw new Error('adminApiPrefix must be /api/admin/')
  if (!Array.isArray(config.routes) || config.routes.length === 0) throw new Error('routes must not be empty')
  if (Object.keys(config.viewports || {}).length < 5) throw new Error('the viewport matrix must contain at least five entries')
  for (const name of config.defaultViewports || []) {
    if (!config.viewports[name]) throw new Error(`unknown default viewport: ${name}`)
  }
  for (const route of config.routes) {
    if (!route.id || !route.path?.startsWith('/')) throw new Error('each route needs an id and absolute path')
  }
}

function parseSelection(raw, available, defaults, label) {
  const selected = raw === 'all' ? Object.keys(available) : (raw ? raw.split(',') : defaults)
  const unique = [...new Set(selected.map((value) => value.trim()).filter(Boolean))]
  if (unique.length === 0) throw new Error(`${label} selection is empty`)
  for (const value of unique) {
    if (!available[value]) throw new Error(`unknown ${label}: ${value}`)
  }
  return unique
}

function sanitizeBaseUrl(raw) {
  const target = new URL(raw)
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('base URL must use HTTP or HTTPS')
  if (target.username || target.password || target.search || target.hash) {
    throw new Error('base URL cannot contain credentials, query parameters, or a fragment')
  }
  target.pathname = target.pathname.replace(/\/$/, '') || '/'
  return target
}

function isLoopback(target) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(target.hostname)
}

function safeMessage(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/https?:\/\/[^\s]+/gi, '[url]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 500)
}

function readCredentials() {
  const envUsername = process.env.ETS_QA_ADMIN_USERNAME || ''
  const envPassword = process.env.ETS_QA_ADMIN_PASSWORD || ''
  if (envUsername && envPassword) return { username: envUsername, password: envPassword, source: 'environment' }

  const file = process.env.ETS_QA_AUTH_FILE
  if (!file) throw new Error('authenticated fixture smoke requires temporary credentials in the environment or ETS_QA_AUTH_FILE')
  const absolute = resolve(file)
  const insideWorkspace = !relative(workspaceRoot, absolute).startsWith('..') && !isAbsolute(relative(workspaceRoot, absolute))
  if (insideWorkspace) {
    try {
      execFileSync('git', ['-C', workspaceRoot, 'check-ignore', '--quiet', '--', absolute], { stdio: 'ignore' })
    } catch {
      throw new Error('a repository-local ETS_QA_AUTH_FILE must be ignored by Git')
    }
  }
  const parsed = JSON.parse(readFileSync(absolute, 'utf8'))
  if (!parsed.username || !parsed.password) throw new Error('ETS_QA_AUTH_FILE needs username and password')
  return { username: String(parsed.username), password: String(parsed.password), source: 'ignored-file' }
}

function fixtureFor(pathname, fixtureState) {
  if (pathname === '/open_api/settings') {
    return {
      title: 'Email Transfer Station QA',
      domains: ['example.test'],
      defaultDomains: ['example.test'],
      domainRegistry: [],
      disableAdminPasswordCheck: false,
      enableGlobalTurnstileCheck: false,
    }
  }
  if (pathname === '/open_api/admin_login_settings') {
    return { accountHint: '', enableGlobalTurnstileCheck: false, cfTurnstileSiteKey: '' }
  }
  if (pathname.startsWith(config.adminApiPrefix)) {
    if (pathname === '/api/admin/overview') return { totals: {}, domains: [] }
    if (pathname === '/api/admin/statistics') return {}
    if (pathname === '/api/admin/domains') return { results: fixtureState.domains }
    if (pathname === '/api/admin/mail_domains') return { results: [{ domain: 'example.test', count: fixtureState.mails.length }] }
    if (pathname === '/api/admin/mail_addresses') return { results: [{ address: 'qa@example.test', count: fixtureState.mails.length }] }
    if (pathname === '/api/admin/mails') {
      return { results: fixtureState.mails, count: fixtureState.mails.length, unread_count: 0 }
    }
    if (pathname === '/api/admin/address') return { results: fixtureState.addresses }
    if (pathname === '/api/admin/access_packages') return { results: [] }
    if (pathname === '/api/admin/worker/configs') return { DIAGNOSTICS: { bindings: {}, database: {} } }
    if (pathname === '/api/admin/db_version') return { code_db_version: 'fixture', need_migration: false }
    return { results: [], count: 0, unread_count: 0 }
  }
  if (pathname.startsWith('/user_api/')) return {}
  return null
}

function addCheck(manifest, id, passed, detail = '') {
  manifest.checks.push({ id, status: passed ? 'passed' : 'failed', detail })
  if (!passed) manifest.failures.push({ check: id, message: detail || 'check failed' })
}

async function runAdminJourney(page, base, prefix, manifest, fixtureState) {
  const adminStorage = await page.evaluate(() => ({
    sessionScoped: sessionStorage.getItem('adminAuth') !== null,
    legacyPersistent: localStorage.getItem('adminAuth') !== null,
  }))
  addCheck(
    manifest,
    `${prefix}:admin-session-storage`,
    adminStorage.sessionScoped && !adminStorage.legacyPersistent,
    'admin session is tab-scoped and the legacy persistent value is absent',
  )

  await page.locator('.nav-link[aria-label="收件流"]').click()
  await page.waitForURL((url) => url.searchParams.get('view') === 'flow')
  const row = page.locator('.mail-row', { hasText: 'QA fixture message' })
  await row.waitFor({ state: 'visible' })
  await row.click()
  await page.waitForURL((url) => !!url.searchParams.get('mailId') && url.searchParams.get('mode') === 'detail')
  const detailUrl = page.url()
  addCheck(manifest, `${prefix}:mail-selection-query`, true, 'mailId and detail mode stored in URL')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.mail-row[aria-selected="true"]', { hasText: 'QA fixture message' }).waitFor({ state: 'attached' })
  await page.locator('.mail-detail-panel').waitFor({ state: 'visible' })
  addCheck(manifest, `${prefix}:mail-selection-refresh`, true, 'selected mail restored after refresh')

  const recipientLabelBox = await page.locator('.recipient-summary dt > span').boundingBox()
  const recipientCopyBox = await page.locator('.recipient-summary .mail-copy-button').boundingBox()
  addCheck(
    manifest,
    `${prefix}:recipient-copy-inline`,
    !!recipientLabelBox && !!recipientCopyBox
      && recipientCopyBox.width === 24 && recipientCopyBox.height === 24
      && recipientCopyBox.x - recipientLabelBox.x - recipientLabelBox.width <= 8,
    recipientCopyBox ? `${Math.round(recipientCopyBox.width)}x${Math.round(recipientCopyBox.height)}px inline action` : 'recipient copy action missing',
  )
  addCheck(
    manifest,
    `${prefix}:single-mail-delete`,
    await page.locator('.mail-detail-panel button.danger').count() === 1,
    'mail detail exposes one delete action in its header',
  )

  const search = page.locator('.searchbox input')
  await search.fill('QA fixture')
  await page.waitForURL((url) => url.searchParams.get('q') === 'QA fixture')
  addCheck(manifest, `${prefix}:mail-filter-query`, await row.count() === 1, 'filter stored in URL with one fixture result')

  await page.goto(new URL('/admin?view=overview', base).toString(), { waitUntil: 'domcontentloaded' })
  await page.locator('.admin-next.app').waitFor({ state: 'visible' })
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('.mail-row[aria-selected="true"]', { hasText: 'QA fixture message' }).waitFor({ state: 'attached' })
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.waitForURL((url) => url.searchParams.get('view') === 'overview')
  await page.goForward({ waitUntil: 'domcontentloaded' })
  await page.waitForURL((url) => url.searchParams.get('view') === 'flow')
  await page.locator('.mail-row[aria-selected="true"]', { hasText: 'QA fixture message' }).waitFor({ state: 'attached' })
  await page.locator('.mail-detail-panel').waitFor({ state: 'visible' })
  addCheck(manifest, `${prefix}:history-navigation`, true, 'back and forward restore canonical admin state')

  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.mail-detail-panel .panel-head .danger').click()
  const successToast = page.locator('.toast').filter({ hasText: '已删除 1 封生产邮件' })
  await successToast.waitFor({ state: 'visible' })
  addCheck(
    manifest,
    `${prefix}:fixture-delete-feedback`,
    await successToast.getAttribute('role') === 'status' && await successToast.getAttribute('aria-live') === 'polite',
    'successful write feedback uses a polite status live region',
  )
  addCheck(manifest, `${prefix}:fixture-delete`, await row.count() === 0, 'confirmed delete completed against fixture data')
  addCheck(
    manifest,
    `${prefix}:fixture-delete-contract`,
    fixtureState.writeContracts.mailDelete,
    'delete carried a session, CSPRNG request ID and explicit confirmation',
  )

  await page.locator('.nav-link[aria-label="地址身份"]').click()
  await page.waitForURL((url) => url.searchParams.get('view') === 'identity')
  const currentNav = page.locator('.nav-link[aria-current="page"]')
  addCheck(
    manifest,
    `${prefix}:single-current-navigation`,
    await currentNav.count() === 1 && await currentNav.getAttribute('aria-label') === '地址身份',
    'exactly one current navigation item identifies the address workspace',
  )
  const addressCellBox = await page.locator('.panel-addresses tbody tr:first-child td:first-child').boundingBox()
  addCheck(
    manifest,
    `${prefix}:address-ledger-readable`,
    !!addressCellBox && addressCellBox.width >= 180,
    addressCellBox ? `${Math.round(addressCellBox.width)}px primary address column` : 'address row missing',
  )

  page.once('dialog', (dialog) => dialog.accept())
  const revealButton = page.locator('.toolbar button', { hasText: '显示凭证' })
  await revealButton.click()
  let modalRoot = page.locator('[aria-labelledby="action-modal-title"]')
  await modalRoot.locator('[data-testid="one-time-result"]').waitFor({ state: 'visible' })
  addCheck(
    manifest,
    `${prefix}:credential-reveal-contract`,
    fixtureState.writeContracts.credentialReveal,
    'credential reveal used confirmed POST with the displayed version and a CSPRNG request ID',
  )
  addCheck(
    manifest,
    `${prefix}:credential-one-time-result`,
    (await modalRoot.locator('[data-testid="one-time-result"]').inputValue()).includes('fixture-address-credential'),
    'synthetic credential is shown only in the one-time result surface',
  )
  await page.keyboard.press('Escape')
  await modalRoot.waitFor({ state: 'hidden' })

  const createButton = page.locator('.toolbar button', { hasText: '新增地址' })
  await createButton.waitFor({ state: 'visible' })
  await createButton.click()
  modalRoot = page.locator('[aria-labelledby="action-modal-title"]')
  let modal = modalRoot.locator('.modal')
  await modal.locator('[data-testid="address-name"]').waitFor({ state: 'visible' })
  const addressDescriptionId = await modalRoot.getAttribute('aria-describedby')
  addCheck(
    manifest,
    `${prefix}:address-create-modal-semantics`,
    await modalRoot.getAttribute('role') === 'dialog'
      && await modalRoot.getAttribute('aria-modal') === 'true'
      && !!addressDescriptionId
      && await page.locator(`#${addressDescriptionId}`).count() === 1,
    'address modal has one labelled and described modal dialog',
  )
  addCheck(
    manifest,
    `${prefix}:address-create-modal-focus`,
    await modal.locator('[data-testid="address-name"]').evaluate((element) => document.activeElement === element),
    'address name receives focus when the modal opens',
  )
  addCheck(
    manifest,
    `${prefix}:address-create-form`,
    await modal.locator('[data-testid="address-domain"] option').filter({ hasText: 'example.test' }).count() === 1,
    'managed domain is available in the real address form',
  )
  let modalBox = await modal.boundingBox()
  const viewportWidth = page.viewportSize()?.width || 0
  addCheck(
    manifest,
    `${prefix}:address-create-modal-fit`,
    !!modalBox && modalBox.x >= 0 && modalBox.x + modalBox.width <= viewportWidth + 1,
    modalBox ? `${Math.round(modalBox.x)}..${Math.round(modalBox.x + modalBox.width)} within ${viewportWidth}px` : 'modal missing',
  )
  await page.keyboard.press('Escape')
  await modalRoot.waitFor({ state: 'hidden' })
  addCheck(
    manifest,
    `${prefix}:address-create-modal-restore-focus`,
    await createButton.evaluate((element) => document.activeElement === element),
    'Escape closes the address modal and restores its trigger',
  )

  const shareButton = page.locator('.cell-actions button', { hasText: '分享' }).first()
  await shareButton.waitFor({ state: 'visible' })
  await shareButton.click()
  modalRoot = page.locator('[aria-labelledby="action-modal-title"]')
  modal = modalRoot.locator('.modal')
  await modal.locator('[data-testid="share-label"]').waitFor({ state: 'visible' })
  addCheck(
    manifest,
    `${prefix}:share-package-modal-focus`,
    await modal.locator('[data-testid="share-label"]').evaluate((element) => document.activeElement === element),
    'share label receives focus when the modal opens',
  )
  addCheck(
    manifest,
    `${prefix}:share-package-form`,
    await modal.locator('[data-testid="share-address"]').inputValue() === 'qa@example.test',
    'share form targets the selected address',
  )
  modalBox = await modal.boundingBox()
  addCheck(
    manifest,
    `${prefix}:share-package-modal-fit`,
    !!modalBox && modalBox.x >= 0 && modalBox.x + modalBox.width <= viewportWidth + 1,
    modalBox ? `${Math.round(modalBox.x)}..${Math.round(modalBox.x + modalBox.width)} within ${viewportWidth}px` : 'modal missing',
  )
  await page.keyboard.press('Escape')
  await modalRoot.waitFor({ state: 'hidden' })
  addCheck(
    manifest,
    `${prefix}:share-package-modal-restore-focus`,
    await shareButton.evaluate((element) => document.activeElement === element),
    'Escape closes the share modal and restores its trigger',
  )
}

async function smoke() {
  validateConfig()
  const base = sanitizeBaseUrl(option('--base-url', config.defaultBaseUrl))
  const fixtures = flag('--fixtures')
  const authenticate = flag('--authenticate')
  if (fixtures && !isLoopback(base)) throw new Error('--fixtures is restricted to a loopback base URL')
  if (authenticate && !fixtures) throw new Error('--authenticate is fixture-only and cannot submit a production login')

  const routeMap = Object.fromEntries(config.routes.map((route) => [route.id, route]))
  const routeNames = parseSelection(option('--routes'), routeMap, config.routes.map((route) => route.id), 'route')
  const viewportNames = parseSelection(option('--viewports'), config.viewports, config.defaultViewports, 'viewport')
  const credentials = authenticate ? readCredentials() : { source: 'none' }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const runRoot = resolve(option('--output-dir', join(outputRoot, 'qa', stamp)))
  const outputRelative = relative(outputRoot, runRoot)
  if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) {
    throw new Error('QA output must be a child of the workspace output directory')
  }
  mkdirSync(runRoot, { recursive: true })

  const manifest = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    productCommit: execFileSync('git', ['-C', productRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    target: {
      baseUrl: base.toString().replace(/\/$/, ''),
      fixtureMode: fixtures,
      routes: routeNames.map((name) => routeMap[name].path),
    },
    viewports: viewportNames.map((name) => ({ name, ...config.viewports[name] })),
    checks: [],
    screenshots: [],
    failures: [],
    network: {
      productionWritesAllowed: false,
      interceptedFixtureLogins: 0,
      interceptedFixtureWrites: [],
      blockedPlatformTelemetry: [],
      blockedWriteRequests: [],
      blockedExternalRequests: 0,
    },
    privacy: {
      authenticated: authenticate,
      credentialSource: credentials.source,
      credentialsRecorded: false,
      headersRecorded: false,
      requestBodiesRecorded: false,
      fixtureDataOnly: fixtures,
      privateDataCaptured: false,
    },
  }

  let browser
  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ headless: !flag('--headed') })
    for (const viewportName of viewportNames) {
      const viewport = config.viewports[viewportName]
      const fixtureState = {
        writeContracts: {
          mailDelete: false,
          credentialReveal: false,
        },
        domains: [{
          id: 1,
          domain: 'example.test',
          display_label: 'QA domain',
          enabled: true,
          receive_mode: 'cloudflare_email',
          setup_status: 'active',
          allow_address_creation: true,
          allow_random_subdomain: true,
          config_version: 1,
        }],
        addresses: [{
          id: 3,
          name: 'qa@example.test',
          credential_version: 1,
          mail_count: 1,
          send_count: 0,
          active_share_token_count: 0,
        }],
        mails: [{
          id: 7,
          address: 'qa@example.test',
          source: 'sender@example.test',
          sender: 'QA Sender <sender@example.test>',
          subject: 'QA fixture message',
          text: 'Fixture-only browser journey message.',
          html: '<p>Fixture-only browser journey message.</p>',
          raw: 'From: sender@example.test\r\nSubject: QA fixture message\r\n\r\nFixture-only browser journey message.',
          is_read: true,
          created_at: '2026-07-15 10:00:00',
          attachments: [],
        }],
      }
      const context = await browser.newContext({ viewport })
      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const method = request.method().toUpperCase()
        const sameOrigin = url.origin === base.origin
        const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method)

        if (!sameOrigin && fixtures) {
          manifest.network.blockedExternalRequests += 1
          await route.abort('blockedbyclient')
          return
        }
        if (!safeMethod) {
          if (!fixtures && sameOrigin && method === 'POST' && url.pathname === '/cdn-cgi/rum') {
            manifest.network.blockedPlatformTelemetry.push({ method, path: url.pathname })
            await route.abort('blockedbyclient')
            return
          }
          if (fixtures && sameOrigin && authenticate && method === 'POST' && url.pathname === '/open_api/admin_login') {
            manifest.network.interceptedFixtureLogins += 1
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'fixture-session' }) })
            return
          }
          if (fixtures && sameOrigin && authenticate && method === 'DELETE' && url.pathname === '/api/admin/mails/7') {
            const body = JSON.parse(request.postData() || '{}')
            const headers = request.headers()
            fixtureState.writeContracts.mailDelete = body.confirm === true
              && headers['x-admin-auth'] === 'fixture-session'
              && adminRequestIdPattern.test(headers['x-admin-request-id'] || '')
            fixtureState.mails = []
            manifest.network.interceptedFixtureWrites.push({ method, path: url.pathname })
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
            return
          }
          if (fixtures && sameOrigin && authenticate && method === 'POST' && url.pathname === '/api/admin/address/3/credential') {
            const body = JSON.parse(request.postData() || '{}')
            const headers = request.headers()
            fixtureState.writeContracts.credentialReveal = body.confirm === true
              && body.expected_credential_version === 1
              && headers['x-admin-auth'] === 'fixture-session'
              && adminRequestIdPattern.test(headers['x-admin-request-id'] || '')
            manifest.network.interceptedFixtureWrites.push({ method, path: url.pathname })
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ jwt: 'fixture-address-credential' }),
            })
            return
          }
          manifest.network.blockedWriteRequests.push({ method, path: url.pathname })
          await route.abort('blockedbyclient')
          return
        }
        if (fixtures && sameOrigin) {
          const body = fixtureFor(url.pathname, fixtureState)
          if (body !== null) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
            return
          }
        }
        await route.continue()
      })

      for (const routeName of routeNames) {
        const routeConfig = routeMap[routeName]
        const page = await context.newPage()
        const pageErrors = []
        let consoleErrors = 0
        page.on('pageerror', (error) => pageErrors.push(safeMessage(error)))
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors += 1
        })
        const prefix = `${viewportName}:${routeName}`
        try {
          const response = await page.goto(new URL(routeConfig.path, base).toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          })
          await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 })
          if (routeName === 'admin') {
            await page.locator('#admin-auth-title').waitFor({ state: 'visible', timeout: 15_000 })
            if (authenticate) {
              await page.locator('input[autocomplete="username"]').fill(credentials.username)
              await page.locator('input[autocomplete="current-password"]').fill(credentials.password)
              await page.locator('button[type="submit"]').click()
              await page.locator('.admin-next.app').waitFor({ state: 'visible', timeout: 20_000 })
              await runAdminJourney(page, base, prefix, manifest, fixtureState)
            }
          }
          await page.waitForTimeout(500)
          const status = response?.status() || 200
          addCheck(manifest, `${prefix}:http-status`, status < 400, `status ${status}`)
          const dimensions = await page.evaluate(() => ({
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }))
          addCheck(
            manifest,
            `${prefix}:horizontal-overflow`,
            dimensions.scrollWidth <= dimensions.clientWidth + 1,
            `${dimensions.scrollWidth}px scroll / ${dimensions.clientWidth}px client`,
          )
          addCheck(manifest, `${prefix}:page-errors`, pageErrors.length === 0, pageErrors.join('; '))
          addCheck(manifest, `${prefix}:canonical-url`, !page.url().includes('demo='), 'no demo query')
          if (routeName === 'admin') {
            const selector = authenticate ? '.admin-next.app' : '#admin-auth-title'
            addCheck(manifest, `${prefix}:admin-state`, await page.locator(selector).isVisible(), authenticate ? 'fixture session visible' : 'login visible')
          }
          const screenshot = join(runRoot, `${viewportName}-${routeName}${authenticate && routeName === 'admin' ? '-authenticated' : ''}.png`)
          await page.screenshot({ path: screenshot, fullPage: false })
          manifest.screenshots.push({
            route: routeConfig.path,
            viewport: viewportName,
            path: workspaceRelative(screenshot),
            authenticated: authenticate && routeName === 'admin',
          })
          manifest.checks.push({ id: `${prefix}:console-errors`, status: 'observed', detail: `${consoleErrors} console error(s)` })
        } catch (error) {
          const message = safeMessage(error)
          manifest.failures.push({ check: prefix, message })
          manifest.checks.push({ id: prefix, status: 'failed', detail: message })
        } finally {
          await page.close()
        }
      }
      await context.close()
    }
    addCheck(
      manifest,
      'network:no-unexpected-writes',
      manifest.network.blockedWriteRequests.length === 0,
      `${manifest.network.blockedWriteRequests.length} unexpected write request(s) blocked`,
    )
    if (manifest.network.blockedPlatformTelemetry.length > 0) {
      manifest.checks.push({
        id: 'network:platform-telemetry',
        status: 'observed',
        detail: `${manifest.network.blockedPlatformTelemetry.length} Cloudflare RUM request(s) blocked`,
      })
    }
    if (authenticate) {
      const expectedAdminJourneys = routeNames.includes('admin') ? viewportNames.length : 0
      addCheck(
        manifest,
        'network:fixture-login-intercepted',
        manifest.network.interceptedFixtureLogins === expectedAdminJourneys,
        `${manifest.network.interceptedFixtureLogins} fixture login(s) intercepted`,
      )
      addCheck(
        manifest,
        'network:fixture-write-intercepted',
        manifest.network.interceptedFixtureWrites.length === expectedAdminJourneys * 2,
        `${manifest.network.interceptedFixtureWrites.length} isolated fixture write(s) intercepted`,
      )
    }
  } catch (error) {
    manifest.failures.push({ check: 'runner', message: safeMessage(error) })
  } finally {
    if (browser) await browser.close()
    manifest.finishedAt = new Date().toISOString()
    writeFileSync(join(runRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }

  console.log(`QA manifest: ${workspaceRelative(join(runRoot, 'manifest.json'))}`)
  console.log(`Checks: ${manifest.checks.filter((check) => check.status === 'passed').length} passed, ${manifest.failures.length} failed`)
  if (manifest.failures.length) process.exitCode = 1
}

function scanStats(target) {
  const result = { fileCount: 0, bytes: 0, oldestMs: Number.POSITIVE_INFINITY, newestMs: 0 }
  function visit(value) {
    const stat = lstatSync(value)
    result.oldestMs = Math.min(result.oldestMs, stat.mtimeMs)
    result.newestMs = Math.max(result.newestMs, stat.mtimeMs)
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const child of readdirSync(value)) visit(join(value, child))
      return
    }
    result.fileCount += 1
    result.bytes += stat.size
  }
  visit(target)
  if (!Number.isFinite(result.oldestMs)) result.oldestMs = 0
  return result
}

function findOutputUnits() {
  if (!existsSync(outputRoot)) return []
  const units = []
  for (const entry of readdirSync(outputRoot, { withFileTypes: true })) {
    const absolute = join(outputRoot, entry.name)
    if (entry.name === 'qa' && entry.isDirectory()) {
      for (const run of readdirSync(absolute, { withFileTypes: true })) {
        units.push(join(absolute, run.name))
      }
    } else {
      units.push(absolute)
    }
  }
  return units
}

function collectReferences() {
  const references = []
  for (const source of activeSources) {
    const absolute = join(workspaceRoot, source)
    if (!existsSync(absolute)) throw new Error(`active source is missing: ${source}`)
    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/output[\\/][^\s`"'<>()[\]{}]+/g)) {
        const path = slash(match[0]).replace(/[.,;:]+$/, '')
        if (path !== 'output/' && path.split('/').length > 1) references.push({ source, line: index + 1, path })
      }
    })
  }
  return references
}

function buildInventory(pruneHistory = []) {
  const generatedMs = Date.now()
  const references = collectReferences()
  const raw = findOutputUnits().map((absolute) => {
    const stats = scanStats(absolute)
    return { absolute, path: workspaceRelative(absolute), ...stats }
  }).sort((a, b) => b.newestMs - a.newestMs)
  const newest = new Set(raw.slice(0, config.retention.minimumRuns).map((entry) => entry.path))
  const maxAge = config.retention.days * 24 * 60 * 60 * 1000
  const entries = raw.map((entry) => {
    const activeReferences = references.filter((reference) =>
      reference.path === entry.path || reference.path.startsWith(`${entry.path}/`),
    )
    const reasons = []
    if (activeReferences.length) reasons.push('referenced by active material')
    if (generatedMs - entry.newestMs <= maxAge) reasons.push(`newer than ${config.retention.days} days`)
    if (newest.has(entry.path)) reasons.push(`one of the newest ${config.retention.minimumRuns} output units`)
    return {
      path: entry.path,
      type: lstatSync(entry.absolute).isDirectory() ? 'directory' : 'file',
      fileCount: entry.fileCount,
      bytes: entry.bytes,
      oldestAt: new Date(entry.oldestMs).toISOString(),
      newestAt: new Date(entry.newestMs).toISOString(),
      activeReferences,
      retentionReasons: reasons,
      decision: reasons.length ? 'retain' : 'prune',
      lossIfPruned: reasons.length ? null : `Unreferenced generated evidence named ${entry.path}; it is not recoverable from the governance Git history.`,
    }
  })
  const retained = entries.filter((entry) => entry.decision === 'retain')
  const candidates = entries.filter((entry) => entry.decision === 'prune')
  return {
    schemaVersion: 1,
    generatedAt: new Date(generatedMs).toISOString(),
    activeSources,
    policy: {
      rule: 'retain active references and every unit from the last N days, with at least the newest M units retained',
      minimumRuns: config.retention.minimumRuns,
      days: config.retention.days,
    },
    summary: {
      totalUnits: entries.length,
      retainedUnits: retained.length,
      pruneCandidates: candidates.length,
      retainedBytes: retained.reduce((sum, entry) => sum + entry.bytes, 0),
      candidateBytes: candidates.reduce((sum, entry) => sum + entry.bytes, 0),
    },
    entries,
    pruneHistory,
  }
}

function writeInventory(inventory) {
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  console.log(`Output inventory: ${workspaceRelative(inventoryPath)}`)
  console.log(`${inventory.summary.retainedUnits} retained, ${inventory.summary.pruneCandidates} prune candidate(s)`)
}

function inventory() {
  validateConfig()
  let history = []
  if (existsSync(inventoryPath)) {
    try {
      history = JSON.parse(readFileSync(inventoryPath, 'utf8')).pruneHistory || []
    } catch {
      history = []
    }
  }
  writeInventory(buildInventory(history))
}

function verifyInsideOutput(entryPath) {
  const absolute = resolve(workspaceRoot, entryPath)
  const inside = relative(outputRoot, absolute)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error(`unsafe prune target: ${entryPath}`)
  return absolute
}

function prune() {
  validateConfig()
  if (!existsSync(inventoryPath)) throw new Error('run inventory and commit it before prune')
  const trackedPath = workspaceRelative(inventoryPath)
  try {
    execFileSync('git', ['-C', workspaceRoot, 'ls-files', '--error-unmatch', trackedPath], { stdio: 'ignore' })
    execFileSync('git', ['-C', workspaceRoot, 'diff', '--quiet', 'HEAD', '--', trackedPath], { stdio: 'ignore' })
  } catch {
    throw new Error('output inventory must be tracked, reviewed, and committed before prune')
  }

  const previous = JSON.parse(readFileSync(inventoryPath, 'utf8'))
  const candidates = previous.entries.filter((entry) => entry.decision === 'prune')
  const removed = []
  for (const entry of candidates) {
    const absolute = verifyInsideOutput(entry.path)
    if (!existsSync(absolute)) throw new Error(`prune candidate disappeared: ${entry.path}`)
    const current = scanStats(absolute)
    const currentNewest = new Date(current.newestMs).toISOString()
    if (current.fileCount !== entry.fileCount || current.bytes !== entry.bytes || currentNewest !== entry.newestAt) {
      throw new Error(`prune candidate changed after inventory: ${entry.path}`)
    }
  }
  for (const entry of candidates) {
    const absolute = verifyInsideOutput(entry.path)
    rmSync(absolute, { recursive: true, force: false })
    removed.push({
      path: entry.path,
      fileCount: entry.fileCount,
      bytes: entry.bytes,
      newestAt: entry.newestAt,
      lossRecordedBeforeDeletion: entry.lossIfPruned,
    })
    console.log(`Pruned ${entry.path}`)
  }
  const history = [
    ...(previous.pruneHistory || []),
    { prunedAt: new Date().toISOString(), entries: removed },
  ]
  writeInventory(buildInventory(history))
}

function help() {
  console.log(`Usage:
  npm run qa -- smoke [--base-url URL] [--fixtures] [--authenticate]
                      [--routes home,admin|all] [--viewports desktop,narrow|all]
                      [--headed] [--output-dir PATH]
  npm run qa -- inventory
  npm run qa -- prune`)
}

try {
  if (command === 'smoke') await smoke()
  else if (command === 'inventory') inventory()
  else if (command === 'prune') prune()
  else if (command === 'help' || command === '--help' || command === '-h') help()
  else throw new Error(`unknown command: ${command}`)
} catch (error) {
  console.error(`QA error: ${safeMessage(error)}`)
  process.exitCode = 1
}
