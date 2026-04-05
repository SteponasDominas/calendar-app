import {
  addDays,
  addMonths,
  addSeconds,
  addWeeks,
  addYears,
  endOfMonth,
  isAfter,
  isBefore,
  startOfMonth,
} from 'date-fns'

import { appEnv } from '@/config/env'
import { supabase } from '@/lib/supabase/client'
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventUpdate,
  RecurrenceFrequency,
} from '@/types/calendar'
import type { Database } from '@/types/database'

import { getMockEventsForRange } from './mockEvents'

type EventRow = Database['public']['Tables']['events']['Row']
type EventInsert = Database['public']['Tables']['events']['Insert']
type EventUpdateRow = Database['public']['Tables']['events']['Update']
type EventColorGroupRow = Database['public']['Tables']['event_color_groups']['Row']

const DEMO_EVENT_STORAGE_KEY = 'calendar-app-demo-events-v1'
const DEMO_COLOR_GROUP_STORAGE_KEY = 'calendar-app-demo-color-groups-v1'
const MAX_RECURRENCE_ITERATIONS = 400
const COLOR_PALETTE = ['#0f766e', '#2563eb', '#ca8a04', '#7c3aed', '#db2777', '#dc2626'] as const

interface LoadEventsForRangeArgs {
  userId: string
  rangeStart: Date
  rangeEnd: Date
}

interface CreateEventArgs {
  userId: string
  input: CalendarEventInput
}

interface UpdateEventArgs {
  userId: string
  update: CalendarEventUpdate
}

interface DeleteEventArgs {
  userId: string
  eventId: string
}

interface StartTrackedEventArgs {
  userId: string
  title: string
  color?: string
}

interface StopTrackedEventArgs {
  userId: string
  eventId?: string
}

type DemoStore = Record<string, CalendarEvent[]>
type DemoColorGroupStore = Record<string, Record<string, string>>

const DEFAULT_COLOR = '#0f766e'
const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ['none', 'daily', 'weekly', 'monthly', 'yearly']

const normalizeTitleKey = (title: string): string => title.trim().toLowerCase().replace(/\s+/g, ' ')

const normalizeRecurrenceFrequency = (frequency: string | null | undefined): RecurrenceFrequency => {
  if (!frequency) {
    return 'none'
  }

  return RECURRENCE_FREQUENCIES.includes(frequency as RecurrenceFrequency)
    ? (frequency as RecurrenceFrequency)
    : 'none'
}

const normalizeRecurrenceInterval = (value: number | undefined): number =>
  Number.isFinite(value) && value !== undefined && value > 0 ? Math.floor(value) : 1

const recurrenceStep = (value: Date, frequency: RecurrenceFrequency, interval: number): Date => {
  switch (frequency) {
    case 'daily':
      return addDays(value, interval)
    case 'weekly':
      return addWeeks(value, interval)
    case 'monthly':
      return addMonths(value, interval)
    case 'yearly':
      return addYears(value, interval)
    default:
      return value
  }
}

const overlapsRange = (
  eventStart: Date,
  eventEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean => isBefore(eventStart, rangeEnd) && isAfter(eventEnd, rangeStart)

const sortByStart = (events: CalendarEvent[]): CalendarEvent[] =>
  [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))

const ensureEndAfterStart = (start: Date, candidateEnd: Date): Date =>
  candidateEnd > start ? candidateEnd : addSeconds(start, 1)

const colorFromTitleKey = (titleKey: string): string => {
  if (!titleKey) {
    return DEFAULT_COLOR
  }

  let hash = 0

  for (let index = 0; index < titleKey.length; index += 1) {
    hash = (hash * 31 + titleKey.charCodeAt(index)) >>> 0
  }

  return COLOR_PALETTE[hash % COLOR_PALETTE.length]
}

const mapRowToBaseCalendarEvent = (row: EventRow, source: CalendarEvent['source']): CalendarEvent => {
  const recurrenceFrequency = normalizeRecurrenceFrequency(row.recurrence_freq)

  return {
    id: row.id,
    persistentId: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    seriesStartsAt: row.starts_at,
    seriesEndsAt: row.ends_at,
    allDay: row.all_day,
    color: row.color,
    isRunning: row.is_running,
    recurrenceFrequency,
    recurrenceInterval: normalizeRecurrenceInterval(row.recurrence_interval),
    recurrenceUntil: row.recurrence_until,
    isRecurringInstance: recurrenceFrequency !== 'none',
    source,
  }
}

const expandRecurringRow = (
  row: EventRow,
  source: CalendarEvent['source'],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] => {
  const baseEvent = mapRowToBaseCalendarEvent(row, source)

  if (baseEvent.recurrenceFrequency === 'none') {
    const start = new Date(baseEvent.startsAt)
    const end = new Date(baseEvent.endsAt)

    return overlapsRange(start, end, rangeStart, rangeEnd) || baseEvent.isRunning
      ? [
          {
            ...baseEvent,
            isRecurringInstance: false,
          },
        ]
      : []
  }

  const initialStart = new Date(baseEvent.startsAt)
  const initialEnd = new Date(baseEvent.endsAt)
  const durationMs = Math.max(initialEnd.getTime() - initialStart.getTime(), 1000)
  const recurrenceUntil = baseEvent.recurrenceUntil ? new Date(baseEvent.recurrenceUntil) : null

  let occurrenceStart = initialStart
  const occurrences: CalendarEvent[] = []

  for (let iteration = 0; iteration < MAX_RECURRENCE_ITERATIONS; iteration += 1) {
    if (occurrenceStart >= rangeEnd) {
      break
    }

    if (recurrenceUntil && occurrenceStart > recurrenceUntil) {
      break
    }

    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs)

    if (overlapsRange(occurrenceStart, occurrenceEnd, rangeStart, rangeEnd)) {
      const occurrenceIso = occurrenceStart.toISOString()

      occurrences.push({
        ...baseEvent,
        id: `${baseEvent.persistentId}::${occurrenceIso}`,
        startsAt: occurrenceIso,
        endsAt: occurrenceEnd.toISOString(),
        seriesStartsAt: baseEvent.seriesStartsAt,
        seriesEndsAt: baseEvent.seriesEndsAt,
        isRecurringInstance: true,
      })
    }

    const nextStart = recurrenceStep(
      occurrenceStart,
      baseEvent.recurrenceFrequency,
      baseEvent.recurrenceInterval,
    )

    if (nextStart.getTime() === occurrenceStart.getTime()) {
      break
    }

    occurrenceStart = nextStart
  }

  return occurrences
}

const expandRowsForRange = (
  rows: EventRow[],
  source: CalendarEvent['source'],
  rangeStart: Date,
  rangeEnd: Date,
): CalendarEvent[] => {
  const expanded: CalendarEvent[] = []

  for (const row of rows) {
    expanded.push(...expandRecurringRow(row, source, rangeStart, rangeEnd))
  }

  return expanded
}

const mergeById = (events: CalendarEvent[]): CalendarEvent[] => {
  const map = new Map<string, CalendarEvent>()

  for (const event of events) {
    map.set(event.id, event)
  }

  return sortByStart([...map.values()])
}

const readDemoStore = (): DemoStore => {
  const raw = window.localStorage.getItem(DEMO_EVENT_STORAGE_KEY)

  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }

    return parsed as DemoStore
  } catch {
    return {}
  }
}

const writeDemoStore = (store: DemoStore): void => {
  window.localStorage.setItem(DEMO_EVENT_STORAGE_KEY, JSON.stringify(store))
}

const readDemoColorGroupStore = (): DemoColorGroupStore => {
  const raw = window.localStorage.getItem(DEMO_COLOR_GROUP_STORAGE_KEY)

  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown

    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }

    return parsed as DemoColorGroupStore
  } catch {
    return {}
  }
}

const writeDemoColorGroupStore = (store: DemoColorGroupStore): void => {
  window.localStorage.setItem(DEMO_COLOR_GROUP_STORAGE_KEY, JSON.stringify(store))
}

const enforceSingleRunningTimer = (events: CalendarEvent[]): CalendarEvent[] => {
  const runningEvents = events.filter((event) => event.isRunning)

  if (runningEvents.length <= 1) {
    return events
  }

  const keep = [...runningEvents].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]

  return events.map((event) =>
    event.isRunning && event.id !== keep.id
      ? {
          ...event,
          isRunning: false,
        }
      : event,
  )
}

const normalizeStoredDemoEvent = (event: CalendarEvent): CalendarEvent => {
  const recurrenceFrequency = normalizeRecurrenceFrequency(event.recurrenceFrequency)

  return {
    ...event,
    persistentId: event.persistentId || event.id,
    source: 'demo',
    color: event.color || DEFAULT_COLOR,
    description: event.description ?? null,
    seriesStartsAt: event.seriesStartsAt || event.startsAt,
    seriesEndsAt: event.seriesEndsAt || event.endsAt,
    isRunning: Boolean(event.isRunning),
    recurrenceFrequency,
    recurrenceInterval: normalizeRecurrenceInterval(event.recurrenceInterval),
    recurrenceUntil: event.recurrenceUntil ?? null,
    isRecurringInstance: recurrenceFrequency !== 'none',
  }
}

const getDemoEventsForUser = (store: DemoStore, userId: string): CalendarEvent[] => {
  const existing = store[userId]

  if (existing && existing.length > 0) {
    const normalized = enforceSingleRunningTimer(existing.map(normalizeStoredDemoEvent))
    store[userId] = normalized
    writeDemoStore(store)

    return normalized
  }

  const currentMonthStart = startOfMonth(new Date())
  const currentMonthEnd = addDays(endOfMonth(currentMonthStart), 1)
  const seeded = getMockEventsForRange(currentMonthStart, currentMonthEnd, userId).map((event) => ({
    ...event,
    persistentId: event.id,
    isRunning: false,
    recurrenceFrequency: 'none' as const,
    recurrenceInterval: 1,
    recurrenceUntil: null,
    isRecurringInstance: false,
    source: 'demo' as const,
  }))

  store[userId] = seeded
  writeDemoStore(store)

  return seeded
}

const resolveDemoColorForTitle = (
  userId: string,
  title: string,
  preferredColor?: string,
): string => {
  const titleKey = normalizeTitleKey(title)

  if (!titleKey) {
    return preferredColor || DEFAULT_COLOR
  }

  const store = readDemoColorGroupStore()
  const userGroups = store[userId] ?? {}

  if (preferredColor) {
    userGroups[titleKey] = preferredColor
    store[userId] = userGroups
    writeDemoColorGroupStore(store)

    return preferredColor
  }

  if (userGroups[titleKey]) {
    return userGroups[titleKey]
  }

  const derived = colorFromTitleKey(titleKey)
  userGroups[titleKey] = derived
  store[userId] = userGroups
  writeDemoColorGroupStore(store)

  return derived
}

const loadDemoEventsForRange = ({ userId, rangeStart, rangeEnd }: LoadEventsForRangeArgs): CalendarEvent[] => {
  const store = readDemoStore()
  const events = getDemoEventsForUser(store, userId)

  const rangedEvents = events.filter((event) =>
    overlapsRange(new Date(event.startsAt), new Date(event.endsAt), rangeStart, rangeEnd),
  )

  const runningEvents = events.filter((event) => event.isRunning)

  return mergeById([...rangedEvents, ...runningEvents])
}

const createDemoEvent = ({ userId, input }: CreateEventArgs): CalendarEvent => {
  const store = readDemoStore()
  const events = getDemoEventsForUser(store, userId)
  const recurrenceFrequency = normalizeRecurrenceFrequency(input.recurrenceFrequency)

  const color = resolveDemoColorForTitle(userId, input.title, input.color)

  const created: CalendarEvent = {
    id: crypto.randomUUID(),
    persistentId: '',
    title: input.title,
    description: input.description ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    seriesStartsAt: input.startsAt,
    seriesEndsAt: input.endsAt,
    allDay: input.allDay,
    color,
    isRunning: false,
    recurrenceFrequency,
    recurrenceInterval: normalizeRecurrenceInterval(input.recurrenceInterval),
    recurrenceUntil: recurrenceFrequency === 'none' ? null : input.recurrenceUntil ?? null,
    isRecurringInstance: recurrenceFrequency !== 'none',
    source: 'demo',
  }

  created.persistentId = created.id

  store[userId] = sortByStart([...events, created])
  writeDemoStore(store)

  return created
}

const updateDemoEvent = ({ userId, update }: UpdateEventArgs): CalendarEvent => {
  const store = readDemoStore()
  const events = getDemoEventsForUser(store, userId)
  const eventIndex = events.findIndex((event) => event.id === update.id)

  if (eventIndex === -1) {
    throw new Error('Event not found.')
  }

  const current = events[eventIndex]
  const nextTitle = update.title ?? current.title
  const nextFrequency =
    update.recurrenceFrequency !== undefined
      ? normalizeRecurrenceFrequency(update.recurrenceFrequency)
      : current.recurrenceFrequency

  const nextColor =
    update.color !== undefined || update.title !== undefined
      ? resolveDemoColorForTitle(userId, nextTitle, update.color)
      : current.color

  const nextIsRunning = update.isRunning ?? current.isRunning

  if (nextIsRunning && !current.isRunning && events.some((event) => event.isRunning && event.id !== current.id)) {
    throw new Error('Only one running timer is allowed. Stop the active timer first.')
  }

  const updated: CalendarEvent = {
    ...current,
    title: nextTitle,
    description: update.description ?? current.description,
    startsAt: update.startsAt ?? current.startsAt,
    endsAt: update.endsAt ?? current.endsAt,
    seriesStartsAt: update.startsAt ?? current.seriesStartsAt,
    seriesEndsAt: update.endsAt ?? current.seriesEndsAt,
    allDay: update.allDay ?? current.allDay,
    color: nextColor,
    isRunning: nextIsRunning,
    recurrenceFrequency: nextFrequency,
    recurrenceInterval:
      update.recurrenceInterval !== undefined
        ? normalizeRecurrenceInterval(update.recurrenceInterval)
        : current.recurrenceInterval,
    recurrenceUntil:
      update.recurrenceUntil !== undefined
        ? update.recurrenceUntil
        : nextFrequency === 'none'
          ? null
          : current.recurrenceUntil,
    isRecurringInstance: nextFrequency !== 'none',
    source: 'demo',
  }

  const nextEvents = [...events]
  nextEvents[eventIndex] = updated

  store[userId] = sortByStart(enforceSingleRunningTimer(nextEvents))
  writeDemoStore(store)

  return updated
}

const deleteDemoEvent = ({ userId, eventId }: DeleteEventArgs): void => {
  const store = readDemoStore()
  const events = getDemoEventsForUser(store, userId)

  store[userId] = events.filter((event) => event.id !== eventId)
  writeDemoStore(store)
}

const startDemoTrackedEvent = ({ userId, title, color }: StartTrackedEventArgs): CalendarEvent => {
  const normalizedTitle = title.trim()

  if (!normalizedTitle) {
    throw new Error('Please enter a title before starting the timer.')
  }

  const store = readDemoStore()
  const events = getDemoEventsForUser(store, userId)

  if (events.some((event) => event.isRunning)) {
    throw new Error('Only one running timer is allowed. Stop the active timer first.')
  }

  const start = new Date()
  const end = addSeconds(start, 1)
  const resolvedColor = resolveDemoColorForTitle(userId, normalizedTitle, color)

  const created: CalendarEvent = {
    id: crypto.randomUUID(),
    persistentId: '',
    title: normalizedTitle,
    description: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    seriesStartsAt: start.toISOString(),
    seriesEndsAt: end.toISOString(),
    allDay: false,
    color: resolvedColor,
    isRunning: true,
    recurrenceFrequency: 'none',
    recurrenceInterval: 1,
    recurrenceUntil: null,
    isRecurringInstance: false,
    source: 'demo',
  }

  created.persistentId = created.id

  store[userId] = sortByStart([...events, created])
  writeDemoStore(store)

  return created
}

const stopDemoTrackedEvent = ({ userId, eventId }: StopTrackedEventArgs): CalendarEvent | null => {
  const store = readDemoStore()
  const events = getDemoEventsForUser(store, userId)

  const activeEvent = eventId
    ? events.find((event) => event.id === eventId && event.isRunning)
    : events.find((event) => event.isRunning)

  if (!activeEvent) {
    return null
  }

  const startedAt = new Date(activeEvent.startsAt)
  const stoppedAt = ensureEndAfterStart(startedAt, new Date())

  const updated = {
    ...activeEvent,
    endsAt: stoppedAt.toISOString(),
    seriesEndsAt: stoppedAt.toISOString(),
    isRunning: false,
    source: 'demo' as const,
  }

  store[userId] = sortByStart(
    events.map((event) => {
      if (event.id !== updated.id) {
        return event
      }

      return updated
    }),
  )

  writeDemoStore(store)

  return updated
}

const resolveSupabaseColorForTitle = async (
  userId: string,
  title: string,
  preferredColor?: string,
): Promise<string> => {
  if (!supabase) {
    return preferredColor || DEFAULT_COLOR
  }

  const titleKey = normalizeTitleKey(title)

  if (!titleKey) {
    return preferredColor || DEFAULT_COLOR
  }

  const { data: existing, error: selectError } = await supabase
    .from('event_color_groups')
    .select('*')
    .eq('user_id', userId)
    .eq('title_key', titleKey)
    .maybeSingle()

  if (selectError) {
    throw new Error(selectError.message)
  }

  if (existing) {
    const existingRow = existing as EventColorGroupRow

    if (preferredColor && preferredColor !== existingRow.color) {
      const { error: updateError } = await supabase
        .from('event_color_groups')
        .update({
          color: preferredColor,
          canonical_title: title.trim(),
        })
        .eq('id', existingRow.id)
        .eq('user_id', userId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return preferredColor
    }

    return existingRow.color
  }

  const derivedColor = preferredColor || colorFromTitleKey(titleKey)

  const { data: inserted, error: insertError } = await supabase
    .from('event_color_groups')
    .insert({
      user_id: userId,
      title_key: titleKey,
      canonical_title: title.trim(),
      color: derivedColor,
    })
    .select('*')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry, error: retryError } = await supabase
        .from('event_color_groups')
        .select('*')
        .eq('user_id', userId)
        .eq('title_key', titleKey)
        .maybeSingle()

      if (retryError) {
        throw new Error(retryError.message)
      }

      if (retry) {
        return preferredColor || retry.color
      }
    }

    throw new Error(insertError.message)
  }

  return inserted.color
}

const mapInputToInsert = async (userId: string, input: CalendarEventInput): Promise<EventInsert> => {
  const recurrenceFrequency = normalizeRecurrenceFrequency(input.recurrenceFrequency)
  const resolvedColor = supabase
    ? await resolveSupabaseColorForTitle(userId, input.title, input.color)
    : resolveDemoColorForTitle(userId, input.title, input.color)

  return {
    user_id: userId,
    title: input.title,
    description: input.description ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    all_day: input.allDay,
    color: resolvedColor || DEFAULT_COLOR,
    is_running: false,
    recurrence_freq: recurrenceFrequency === 'none' ? null : recurrenceFrequency,
    recurrence_interval: normalizeRecurrenceInterval(input.recurrenceInterval),
    recurrence_until: recurrenceFrequency === 'none' ? null : input.recurrenceUntil ?? null,
  }
}

const mapUpdateToRow = async (
  userId: string,
  currentRow: EventRow,
  update: CalendarEventUpdate,
): Promise<EventUpdateRow> => {
  const payload: EventUpdateRow = {}

  const nextTitle = update.title ?? currentRow.title
  const needsColorResolution = update.color !== undefined || update.title !== undefined

  if (update.title !== undefined) payload.title = update.title
  if (update.description !== undefined) payload.description = update.description
  if (update.startsAt !== undefined) payload.starts_at = update.startsAt
  if (update.endsAt !== undefined) payload.ends_at = update.endsAt
  if (update.allDay !== undefined) payload.all_day = update.allDay
  if (update.isRunning !== undefined) payload.is_running = update.isRunning

  if (needsColorResolution) {
    payload.color = supabase
      ? await resolveSupabaseColorForTitle(userId, nextTitle, update.color)
      : resolveDemoColorForTitle(userId, nextTitle, update.color)
  } else if (update.color !== undefined) {
    payload.color = update.color
  }

  if (update.recurrenceFrequency !== undefined) {
    const normalized = normalizeRecurrenceFrequency(update.recurrenceFrequency)
    payload.recurrence_freq = normalized === 'none' ? null : normalized
  }

  if (update.recurrenceInterval !== undefined) {
    payload.recurrence_interval = normalizeRecurrenceInterval(update.recurrenceInterval)
  }

  if (update.recurrenceUntil !== undefined) {
    payload.recurrence_until = update.recurrenceUntil
  }

  if (update.recurrenceFrequency !== undefined && normalizeRecurrenceFrequency(update.recurrenceFrequency) === 'none') {
    payload.recurrence_until = null
    payload.recurrence_interval = 1
  }

  return payload
}

export const loadEventsForRange = async ({
  userId,
  rangeStart,
  rangeEnd,
}: LoadEventsForRangeArgs): Promise<CalendarEvent[]> => {
  if (!supabase || !appEnv.isSupabaseConfigured) {
    return loadDemoEventsForRange({ userId, rangeStart, rangeEnd })
  }

  try {
    const [
      { data: nonRecurringRows, error: nonRecurringError },
      { data: recurringRows, error: recurringError },
      { data: runningRows, error: runningError },
    ] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .is('recurrence_freq', null)
        .lt('starts_at', rangeEnd.toISOString())
        .gt('ends_at', rangeStart.toISOString())
        .order('starts_at', { ascending: true }),
      supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .not('recurrence_freq', 'is', null)
        .lt('starts_at', rangeEnd.toISOString())
        .or(`recurrence_until.is.null,recurrence_until.gte.${rangeStart.toISOString()}`)
        .order('starts_at', { ascending: true }),
      supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .eq('is_running', true)
        .limit(1),
    ])

    if (nonRecurringError) {
      throw nonRecurringError
    }

    if (recurringError) {
      throw recurringError
    }

    if (runningError) {
      throw runningError
    }

    const mergedRows = new Map<string, EventRow>()

    for (const row of nonRecurringRows ?? []) {
      mergedRows.set(row.id, row)
    }

    for (const row of recurringRows ?? []) {
      mergedRows.set(row.id, row)
    }

    for (const row of runningRows ?? []) {
      mergedRows.set(row.id, row)
    }

    if (mergedRows.size === 0) {
      return appEnv.enableMockFallback ? getMockEventsForRange(rangeStart, rangeEnd, userId) : []
    }

    const expanded = expandRowsForRange([...mergedRows.values()], 'supabase', rangeStart, rangeEnd)

    return mergeById(expanded)
  } catch (error) {
    console.error('Event query failed, falling back to mock events.', error)

    if (appEnv.enableMockFallback) {
      return getMockEventsForRange(rangeStart, rangeEnd, userId)
    }

    return []
  }
}

export const createEvent = async ({ userId, input }: CreateEventArgs): Promise<CalendarEvent> => {
  if (!supabase || !appEnv.isSupabaseConfigured) {
    return createDemoEvent({ userId, input })
  }

  const insertPayload = await mapInputToInsert(userId, input)

  const { data, error } = await supabase
    .from('events')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapRowToBaseCalendarEvent(data, 'supabase')
}

export const updateEvent = async ({ userId, update }: UpdateEventArgs): Promise<CalendarEvent> => {
  if (!supabase || !appEnv.isSupabaseConfigured) {
    return updateDemoEvent({ userId, update })
  }

  const { data: currentRow, error: currentError } = await supabase
    .from('events')
    .select('*')
    .eq('id', update.id)
    .eq('user_id', userId)
    .single()

  if (currentError) {
    throw new Error(currentError.message)
  }

  const payload = await mapUpdateToRow(userId, currentRow, update)

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', update.id)
    .eq('user_id', userId)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505' && payload.is_running === true) {
      throw new Error('Only one running timer is allowed. Stop the active timer first.')
    }

    throw new Error(error.message)
  }

  return mapRowToBaseCalendarEvent(data, 'supabase')
}

export const deleteEvent = async ({ userId, eventId }: DeleteEventArgs): Promise<void> => {
  if (!supabase || !appEnv.isSupabaseConfigured) {
    deleteDemoEvent({ userId, eventId })
    return
  }

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('user_id', userId)

  if (error) {
    throw new Error(error.message)
  }
}

export const startTrackedEvent = async ({
  userId,
  title,
  color,
}: StartTrackedEventArgs): Promise<CalendarEvent> => {
  const normalizedTitle = title.trim()

  if (!normalizedTitle) {
    throw new Error('Please enter a title before starting the timer.')
  }

  if (!supabase || !appEnv.isSupabaseConfigured) {
    return startDemoTrackedEvent({ userId, title: normalizedTitle, color })
  }

  const start = new Date()
  const provisionalEnd = addSeconds(start, 1)
  const resolvedColor = await resolveSupabaseColorForTitle(userId, normalizedTitle, color)

  const insertPayload: EventInsert = {
    user_id: userId,
    title: normalizedTitle,
    description: null,
    starts_at: start.toISOString(),
    ends_at: provisionalEnd.toISOString(),
    all_day: false,
    color: resolvedColor,
    is_running: true,
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_until: null,
  }

  const { data, error } = await supabase
    .from('events')
    .insert(insertPayload)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Only one running timer is allowed. Stop the active timer first.')
    }

    throw new Error(error.message)
  }

  return mapRowToBaseCalendarEvent(data, 'supabase')
}

export const stopTrackedEvent = async ({
  userId,
  eventId,
}: StopTrackedEventArgs): Promise<CalendarEvent | null> => {
  if (!supabase || !appEnv.isSupabaseConfigured) {
    return stopDemoTrackedEvent({ userId, eventId })
  }

  let runningQuery = supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .eq('is_running', true)

  if (eventId) {
    runningQuery = runningQuery.eq('id', eventId)
  }

  const { data: runningRow, error: runningError } = await runningQuery.maybeSingle()

  if (runningError) {
    throw new Error(runningError.message)
  }

  if (!runningRow) {
    return null
  }

  const stopAt = ensureEndAfterStart(new Date(runningRow.starts_at), new Date())

  const { data, error } = await supabase
    .from('events')
    .update({
      ends_at: stopAt.toISOString(),
      is_running: false,
    })
    .eq('id', runningRow.id)
    .eq('user_id', userId)
    .eq('is_running', true)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapRowToBaseCalendarEvent(data, 'supabase')
}
