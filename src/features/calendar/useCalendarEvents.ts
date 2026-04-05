import { useCallback, useEffect, useMemo, useState } from 'react'

import type { CalendarEvent, CalendarEventInput, CalendarEventUpdate } from '@/types/calendar'

import {
  createEvent,
  deleteEvent,
  loadEventsForRange,
  startTrackedEvent as startTrackedEventRepository,
  stopTrackedEvent as stopTrackedEventRepository,
  updateEvent,
} from './eventRepository'

interface VisibleRange {
  start: Date
  end: Date
}

interface UseCalendarEventsResult {
  events: CalendarEvent[]
  activeTrackedEvent: CalendarEvent | null
  isLoading: boolean
  isMutating: boolean
  error: string | null
  mutationError: string | null
  createCalendarEvent: (input: CalendarEventInput) => Promise<CalendarEvent>
  updateCalendarEvent: (update: CalendarEventUpdate) => Promise<CalendarEvent>
  deleteCalendarEvent: (eventId: string) => Promise<void>
  startTrackedEvent: (title: string, color?: string) => Promise<CalendarEvent>
  stopTrackedEvent: (eventId?: string) => Promise<CalendarEvent | null>
  refresh: () => Promise<void>
}

const sortByStart = (events: CalendarEvent[]): CalendarEvent[] =>
  [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))

const normalizeRunningState = (events: CalendarEvent[]): CalendarEvent[] => {
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

export const useCalendarEvents = (
  visibleRange: VisibleRange,
  userId: string | null,
): UseCalendarEventsResult => {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const stableRange = useMemo(
    () => ({
      start: new Date(visibleRange.start),
      end: new Date(visibleRange.end),
    }),
    [visibleRange.end, visibleRange.start],
  )

  const refresh = useCallback(async () => {
    if (!userId) {
      setEvents([])
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await loadEventsForRange({
        userId,
        rangeStart: stableRange.start,
        rangeEnd: stableRange.end,
      })

      setEvents(sortByStart(normalizeRunningState(result)))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load calendar events.')
      setEvents([])
    } finally {
      setIsLoading(false)
    }
  }, [stableRange.end, stableRange.start, userId])

  useEffect(() => {
    let cancelled = false

    if (!userId) {
      setEvents([])
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    void loadEventsForRange({
      userId,
      rangeStart: stableRange.start,
      rangeEnd: stableRange.end,
    })
      .then((result) => {
        if (!cancelled) {
          setEvents(sortByStart(normalizeRunningState(result)))
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load calendar events.')
          setEvents([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [stableRange.end, stableRange.start, userId])

  const createCalendarEvent = useCallback(
    async (input: CalendarEventInput): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You need to be signed in to create events.')
      }

      setMutationError(null)
      setIsMutating(true)

      try {
        const created = await createEvent({ userId, input })
        await refresh()
        return created
      } catch (createError) {
        const message =
          createError instanceof Error ? createError.message : 'Unable to create event right now.'

        setMutationError(message)
        throw new Error(message)
      } finally {
        setIsMutating(false)
      }
    },
    [refresh, userId],
  )

  const updateCalendarEvent = useCallback(
    async (update: CalendarEventUpdate): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You need to be signed in to update events.')
      }

      setMutationError(null)
      setIsMutating(true)

      try {
        const updated = await updateEvent({ userId, update })
        await refresh()
        return updated
      } catch (updateError) {
        const message =
          updateError instanceof Error ? updateError.message : 'Unable to update event right now.'

        setMutationError(message)
        throw new Error(message)
      } finally {
        setIsMutating(false)
      }
    },
    [refresh, userId],
  )

  const deleteCalendarEvent = useCallback(
    async (eventId: string): Promise<void> => {
      if (!userId) {
        throw new Error('You need to be signed in to delete events.')
      }

      setMutationError(null)
      setIsMutating(true)

      try {
        await deleteEvent({ userId, eventId })
        await refresh()
      } catch (deleteError) {
        const message =
          deleteError instanceof Error ? deleteError.message : 'Unable to delete event right now.'

        setMutationError(message)
        throw new Error(message)
      } finally {
        setIsMutating(false)
      }
    },
    [refresh, userId],
  )

  const startTrackedEvent = useCallback(
    async (title: string, color?: string): Promise<CalendarEvent> => {
      if (!userId) {
        throw new Error('You need to be signed in to start a timer.')
      }

      setMutationError(null)
      setIsMutating(true)

      try {
        const started = await startTrackedEventRepository({
          userId,
          title,
          color,
        })

        await refresh()
        return started
      } catch (startError) {
        const message =
          startError instanceof Error ? startError.message : 'Unable to start timer right now.'

        setMutationError(message)
        throw new Error(message)
      } finally {
        setIsMutating(false)
      }
    },
    [refresh, userId],
  )

  const stopTrackedEvent = useCallback(
    async (eventId?: string): Promise<CalendarEvent | null> => {
      if (!userId) {
        throw new Error('You need to be signed in to stop a timer.')
      }

      setMutationError(null)
      setIsMutating(true)

      try {
        const stopped = await stopTrackedEventRepository({ userId, eventId })
        await refresh()
        return stopped
      } catch (stopError) {
        const message =
          stopError instanceof Error ? stopError.message : 'Unable to stop timer right now.'

        setMutationError(message)
        throw new Error(message)
      } finally {
        setIsMutating(false)
      }
    },
    [refresh, userId],
  )

  const activeTrackedEvent = useMemo<CalendarEvent | null>(() => {
    const runningEvents = events.filter((event) => event.isRunning)

    if (runningEvents.length === 0) {
      return null
    }

    return [...runningEvents].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]
  }, [events])

  return {
    events,
    activeTrackedEvent,
    isLoading,
    isMutating,
    error,
    mutationError,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    startTrackedEvent,
    stopTrackedEvent,
    refresh,
  }
}
