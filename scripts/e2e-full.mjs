import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

import { chromium, devices } from 'playwright'

const BASE_URL = 'http://127.0.0.1:5173'
const SERVER_PORT = '5173'
const STARTUP_TIMEOUT_MS = 120_000
const ASSERT_TIMEOUT_MS = 12_000

const runStep = async (name, action) => {
  const startedAt = Date.now()
  process.stdout.write(`\n[STEP] ${name}\n`)
  await action()
  const elapsedMs = Date.now() - startedAt
  process.stdout.write(`[OK] ${name} (${elapsedMs}ms)\n`)
}

const toLocalDateLabel = (value) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const assertCondition = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const waitForServer = async () => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      const response = await fetch(BASE_URL)

      if (response.ok) {
        return
      }
    } catch {
      // Server is not up yet.
    }

    await sleep(600)
  }

  throw new Error(`Server did not start within ${STARTUP_TIMEOUT_MS}ms.`)
}

const makeDemoEmail = () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
  return `qa+${suffix}@example.com`
}

const startDevServer = () => {
  const child = spawn(`npm run dev -- --host 127.0.0.1 --port ${SERVER_PORT} --strictPort --mode e2e`, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[dev] ${chunk.toString()}`)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[dev:err] ${chunk.toString()}`)
  })

  return child
}

const stopProcess = async (child) => {
  if (!child || child.killed) {
    return
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    })
    return
  }

  child.kill('SIGTERM')
  await sleep(1000)

  if (child.exitCode === null) {
    child.kill('SIGKILL')
  }
}

const clearStorageAndOpenAuth = async (page) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Ship the core before the extras' }).waitFor({
    timeout: ASSERT_TIMEOUT_MS,
  })
}

const signInDemo = async (page, email) => {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.locator('form button[type="submit"]').click()
  const calendarHeading = page.getByRole('heading', { name: 'Calendar' })

  try {
    await calendarHeading.waitFor({ timeout: ASSERT_TIMEOUT_MS })
    return
  } catch {
    const errorBanner = page.locator('.status-note.error').first()
    if (await errorBanner.isVisible()) {
      const errorText = (await errorBanner.textContent())?.trim() || 'unknown auth error'
      throw new Error(`Auth did not pass: ${errorText}`)
    }

    throw new Error('Auth did not navigate to Calendar view within timeout.')
  }
}

const createEvent = async (page, title, options = {}) => {
  const {
    description = '',
    recurrence = 'Does not repeat',
    allDay = false,
  } = options

  await page.getByRole('button', { name: 'New Event' }).click()
  await page.getByRole('heading', { name: 'New Event' }).waitFor({ timeout: ASSERT_TIMEOUT_MS })

  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Description').fill(description)

  if (allDay) {
    const allDayCheckbox = page.getByLabel('All-day event')
    if (!(await allDayCheckbox.isChecked())) {
      await allDayCheckbox.check()
    }
  }

  if (recurrence !== 'Does not repeat') {
    await page.getByLabel('Frequency').selectOption({ label: recurrence })
  }

  await page.locator('.event-editor-form button[type="submit"]').click()
  await page.getByRole('heading', { name: 'New Event' }).waitFor({
    state: 'detached',
    timeout: ASSERT_TIMEOUT_MS,
  })
}

const editUpcomingEventTitle = async (page, currentTitle, nextTitle) => {
  await page.getByRole('button', { name: new RegExp(currentTitle, 'i') }).first().click()
  await page.getByRole('heading', { name: 'Edit Event' }).waitFor({ timeout: ASSERT_TIMEOUT_MS })
  await page.getByLabel('Title').fill(nextTitle)
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await page.getByRole('heading', { name: 'Edit Event' }).waitFor({
    state: 'detached',
    timeout: ASSERT_TIMEOUT_MS,
  })
}

const deleteUpcomingEvent = async (page, title) => {
  await page.getByRole('button', { name: new RegExp(title, 'i') }).first().click()
  await page.getByRole('heading', { name: 'Edit Event' }).waitFor({ timeout: ASSERT_TIMEOUT_MS })

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await page.getByRole('button', { name: 'Delete' }).click()

  await page.getByRole('heading', { name: 'Edit Event' }).waitFor({
    state: 'detached',
    timeout: ASSERT_TIMEOUT_MS,
  })
}

const readDemoStorage = async (page) =>
  page.evaluate(() => {
    const userRaw = window.localStorage.getItem('calendar-app-demo-user')
    const eventsRaw = window.localStorage.getItem('calendar-app-demo-events-v1')
    const groupsRaw = window.localStorage.getItem('calendar-app-demo-color-groups-v1')

    const user = userRaw ? JSON.parse(userRaw) : null
    const events = eventsRaw ? JSON.parse(eventsRaw) : {}
    const groups = groupsRaw ? JSON.parse(groupsRaw) : {}

    return {
      user,
      events,
      groups,
    }
  })

const testDesktopFlow = async (browser) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  await runStep('Desktop: open auth in demo mode', async () => {
    await clearStorageAndOpenAuth(page)
  })

  const email = makeDemoEmail()

  await runStep('Desktop: sign in', async () => {
    await signInDemo(page, email)
  })

  await runStep('Desktop: create event', async () => {
    await createEvent(page, 'E2E Planned Work', {
      description: 'Desk flow create check',
    })
    await page.locator('.event-panel').getByText('E2E Planned Work').first().waitFor({
      timeout: ASSERT_TIMEOUT_MS,
    })
  })

  await runStep('Desktop: edit event title', async () => {
    await editUpcomingEventTitle(page, 'E2E Planned Work', 'E2E Planned Work Updated')
    await page.locator('.event-panel').getByText('E2E Planned Work Updated').first().waitFor({
      timeout: ASSERT_TIMEOUT_MS,
    })
  })

  await runStep('Desktop: create recurring event', async () => {
    await createEvent(page, 'Daily Sync', {
      recurrence: 'Daily',
    })
    await page.locator('.event-panel').getByText('Daily Sync').first().waitFor({
      timeout: ASSERT_TIMEOUT_MS,
    })
    await page.locator('.event-panel').getByText('Recurring').first().waitFor({
      timeout: ASSERT_TIMEOUT_MS,
    })
  })

  await runStep('Desktop: verify title color grouping is stable', async () => {
    await createEvent(page, 'Daily Sync', {
      description: 'Second event with same title',
    })

    const storage = await readDemoStorage(page)
    const userId = storage.user?.id
    assertCondition(Boolean(userId), 'Missing demo user in localStorage.')
    const userEvents = storage.events[userId] ?? []
    const sameTitleEvents = userEvents.filter(
      (event) => typeof event.title === 'string' && event.title.trim().toLowerCase() === 'daily sync',
    )
    assertCondition(sameTitleEvents.length >= 2, 'Expected at least two "Daily Sync" events.')

    const colors = new Set(sameTitleEvents.map((event) => event.color))
    assertCondition(colors.size === 1, 'Same-title events should share one color group.')

    const groupedColor = storage.groups[userId]?.['daily sync']
    assertCondition(Boolean(groupedColor), 'Expected color group entry for "daily sync".')
  })

  await runStep('Desktop: start running timer + one-timer guard', async () => {
    await page.locator('#quick-track-title').fill('Focus Session')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByText('Live Tracking').waitFor({ timeout: ASSERT_TIMEOUT_MS })
    await page.getByText('Focus Session').first().waitFor({ timeout: ASSERT_TIMEOUT_MS })
    await assertCondition(
      await page.locator('#quick-track-title').isDisabled(),
      'Quick track title input should be disabled while timer is running.',
    )
    await assertCondition(
      await page.getByRole('button', { name: 'Start' }).isDisabled(),
      'Start button should be disabled while timer is running.',
    )
  })

  await runStep('Desktop: running timer survives reload', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Live Tracking').waitFor({ timeout: ASSERT_TIMEOUT_MS })
    await page.getByText('Focus Session').first().waitFor({ timeout: ASSERT_TIMEOUT_MS })
  })

  await runStep('Desktop: stop running timer', async () => {
    await page.getByRole('button', { name: 'Stop' }).click()
    await page.waitForSelector('.active-timer-bar', {
      state: 'detached',
      timeout: ASSERT_TIMEOUT_MS,
    })
  })

  await runStep('Desktop: drag event in calendar persists start time', async () => {
    await createEvent(page, 'Drag Check Event', {
      description: 'Drag scenario',
      allDay: true,
    })

    const before = await readDemoStorage(page)
    const userId = before.user?.id
    const userEvents = before.events[userId] ?? []
    const dragEventBefore = userEvents.find((event) => event.title === 'Drag Check Event')
    assertCondition(Boolean(dragEventBefore), 'Drag test event not found before drag.')
    const startBefore = dragEventBefore.startsAt

    const startDate = new Date(startBefore)
    const targetDate = new Date(startDate.getTime())
    targetDate.setDate(startDate.getDate() + 1)
    const targetDateIso = toLocalDateLabel(targetDate)

    const eventLocator = page.locator('.fc-daygrid-event:has-text("Drag Check Event")').first()
    await eventLocator.waitFor({ timeout: ASSERT_TIMEOUT_MS })

    const targetDayCell = page.locator(`.fc-daygrid-day[data-date="${targetDateIso}"]`).first()
    await targetDayCell.waitFor({ timeout: ASSERT_TIMEOUT_MS })
    const sourceBox = await eventLocator.boundingBox()
    const targetBox = await targetDayCell.boundingBox()
    assertCondition(Boolean(sourceBox), 'Unable to get drag source bounding box.')
    assertCondition(Boolean(targetBox), 'Unable to get drag target bounding box.')

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 20,
    })
    await page.mouse.up()

    await sleep(1200)

    const after = await readDemoStorage(page)
    const afterEvents = after.events[userId] ?? []
    const dragEventAfter = afterEvents.find((event) => event.title === 'Drag Check Event')
    assertCondition(Boolean(dragEventAfter), 'Drag test event missing after drag.')
    assertCondition(
      dragEventAfter.startsAt !== startBefore,
      `Drag did not update event start time in persisted storage (before=${startBefore}, after=${dragEventAfter.startsAt}).`,
    )
  })

  await runStep('Desktop: resize event persists end time', async () => {
    const before = await readDemoStorage(page)
    const userId = before.user?.id
    const beforeEvents = before.events[userId] ?? []
    const dragEventBefore = beforeEvents.find((event) => event.title === 'Drag Check Event')
    assertCondition(Boolean(dragEventBefore), 'Resize test event not found before resize.')
    const endBefore = dragEventBefore.endsAt

    const eventLocator = page.locator('.fc-daygrid-event:has-text("Drag Check Event")').first()
    await eventLocator.waitFor({ timeout: ASSERT_TIMEOUT_MS })

    const startDate = new Date(dragEventBefore.startsAt)
    const resizeTargetDate = new Date(startDate.getTime())
    resizeTargetDate.setDate(startDate.getDate() + 3)
    const resizeTargetIso = toLocalDateLabel(resizeTargetDate)
    const resizeTargetDayCell = page.locator(`.fc-daygrid-day[data-date="${resizeTargetIso}"]`).first()
    await resizeTargetDayCell.waitFor({ timeout: ASSERT_TIMEOUT_MS })
    const eventBox = await eventLocator.boundingBox()
    const resizeTargetBox = await resizeTargetDayCell.boundingBox()
    assertCondition(Boolean(eventBox), 'Unable to get day-grid event box for resize.')
    assertCondition(Boolean(resizeTargetBox), 'Unable to get resize target bounding box.')

    await page.mouse.move(eventBox.x + eventBox.width - 2, eventBox.y + eventBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      resizeTargetBox.x + resizeTargetBox.width / 2,
      resizeTargetBox.y + resizeTargetBox.height / 2,
      { steps: 20 },
    )
    await page.mouse.up()

    await sleep(1200)

    const after = await readDemoStorage(page)
    const afterEvents = after.events[userId] ?? []
    const dragEventAfter = afterEvents.find((event) => event.title === 'Drag Check Event')
    assertCondition(Boolean(dragEventAfter), 'Resize test event missing after resize.')
    assertCondition(
      dragEventAfter.endsAt !== endBefore,
      'Resize did not update event end time in persisted storage.',
    )
  })

  await runStep('Desktop: delete event', async () => {
    await deleteUpcomingEvent(page, 'E2E Planned Work Updated')
    const remaining = page.getByText('E2E Planned Work Updated')
    await remaining.waitFor({ state: 'detached', timeout: ASSERT_TIMEOUT_MS })
  })

  await runStep('Desktop: sign out returns auth screen', async () => {
    await page.getByRole('button', { name: 'Sign Out' }).click()
    await page.getByRole('heading', { name: 'Ship the core before the extras' }).waitFor({
      timeout: ASSERT_TIMEOUT_MS,
    })
  })

  await context.close()
}

const testMobileFlow = async (browser) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
  })
  const page = await context.newPage()

  await runStep('Mobile: open auth and sign in', async () => {
    await clearStorageAndOpenAuth(page)
    await signInDemo(page, makeDemoEmail())
  })

  await runStep('Mobile: FAB opens event editor and creates event', async () => {
    const fab = page.locator('button[aria-label="Create event"]')
    await fab.waitFor({ state: 'visible', timeout: ASSERT_TIMEOUT_MS })
    await fab.click()

    await page.getByRole('heading', { name: 'New Event' }).waitFor({ timeout: ASSERT_TIMEOUT_MS })
    await page.getByLabel('Title').fill('Mobile E2E Event')
    await page.locator('.event-editor-form button[type="submit"]').click()
    await page.getByRole('heading', { name: 'New Event' }).waitFor({
      state: 'detached',
      timeout: ASSERT_TIMEOUT_MS,
    })

    await page.locator('.event-panel').getByText('Mobile E2E Event').first().waitFor({
      timeout: ASSERT_TIMEOUT_MS,
    })
  })

  await runStep('Mobile: quick timer start/stop', async () => {
    await page.locator('#quick-track-title').fill('Mobile Focus')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByText('Live Tracking').waitFor({ timeout: ASSERT_TIMEOUT_MS })
    await page.getByRole('button', { name: 'Stop' }).click()
    await page.waitForSelector('.active-timer-bar', { state: 'detached', timeout: ASSERT_TIMEOUT_MS })
  })

  await context.close()
}

const main = async () => {
  const devServer = startDevServer()
  let browser

  try {
    await runStep('Wait for dev server', waitForServer)

    browser = await chromium.launch({ headless: true })
    await testDesktopFlow(browser)
    await testMobileFlow(browser)

    process.stdout.write('\n[SUCCESS] Full UI/functional E2E suite passed.\n')
  } catch (error) {
    process.stderr.write(`\n[FAILED] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  } finally {
    if (browser) {
      await browser.close()
    }

    await stopProcess(devServer)
  }
}

await main()
