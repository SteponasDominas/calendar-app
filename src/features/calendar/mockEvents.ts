import { addDays, addHours, isAfter, isBefore, set, startOfMonth } from 'date-fns'

import type { CalendarEvent } from '@/types/calendar'

const DEFAULT_COLOR = '#0f766e'

const createTimedDate = (monthAnchor: Date, dayOffset: number, hour: number, minute = 0): Date =>
  set(addDays(monthAnchor, dayOffset), {
    hours: hour,
    minutes: minute,
    seconds: 0,
    milliseconds: 0,
  })

const overlapsRange = (
  eventStart: Date,
  eventEnd: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean => isBefore(eventStart, rangeEnd) && isAfter(eventEnd, rangeStart)

export const getMockEventsForRange = (
  rangeStart: Date,
  rangeEnd: Date,
  userId: string,
): CalendarEvent[] => {
  const monthAnchor = startOfMonth(rangeStart)

  const mockEvents: CalendarEvent[] = [
    {
      id: `${userId}-mock-1`,
      persistentId: `${userId}-mock-1`,
      title: 'Product sync',
      description: 'Weekly project checkpoint with engineering and design.',
      startsAt: createTimedDate(monthAnchor, 2, 10).toISOString(),
      endsAt: createTimedDate(monthAnchor, 2, 11, 15).toISOString(),
      seriesStartsAt: createTimedDate(monthAnchor, 2, 10).toISOString(),
      seriesEndsAt: createTimedDate(monthAnchor, 2, 11, 15).toISOString(),
      allDay: false,
      color: DEFAULT_COLOR,
      isRunning: false,
      recurrenceFrequency: 'none',
      recurrenceInterval: 1,
      recurrenceUntil: null,
      isRecurringInstance: false,
      source: 'mock',
    },
    {
      id: `${userId}-mock-2`,
      persistentId: `${userId}-mock-2`,
      title: 'Deep work block',
      description: 'No-meeting focus window for roadmap delivery.',
      startsAt: createTimedDate(monthAnchor, 5, 8, 30).toISOString(),
      endsAt: createTimedDate(monthAnchor, 5, 11, 30).toISOString(),
      seriesStartsAt: createTimedDate(monthAnchor, 5, 8, 30).toISOString(),
      seriesEndsAt: createTimedDate(monthAnchor, 5, 11, 30).toISOString(),
      allDay: false,
      color: '#2563eb',
      isRunning: false,
      recurrenceFrequency: 'none',
      recurrenceInterval: 1,
      recurrenceUntil: null,
      isRecurringInstance: false,
      source: 'mock',
    },
    {
      id: `${userId}-mock-3`,
      persistentId: `${userId}-mock-3`,
      title: 'Release retro',
      description: 'Capture wins, pain points, and next iteration actions.',
      startsAt: createTimedDate(monthAnchor, 12, 16).toISOString(),
      endsAt: createTimedDate(monthAnchor, 12, 17).toISOString(),
      seriesStartsAt: createTimedDate(monthAnchor, 12, 16).toISOString(),
      seriesEndsAt: createTimedDate(monthAnchor, 12, 17).toISOString(),
      allDay: false,
      color: '#ca8a04',
      isRunning: false,
      recurrenceFrequency: 'none',
      recurrenceInterval: 1,
      recurrenceUntil: null,
      isRecurringInstance: false,
      source: 'mock',
    },
    {
      id: `${userId}-mock-4`,
      persistentId: `${userId}-mock-4`,
      title: 'Sprint planning',
      description: 'Prioritize incoming backlog and assign owners.',
      startsAt: createTimedDate(monthAnchor, 18, 9).toISOString(),
      endsAt: createTimedDate(monthAnchor, 18, 10, 30).toISOString(),
      seriesStartsAt: createTimedDate(monthAnchor, 18, 9).toISOString(),
      seriesEndsAt: createTimedDate(monthAnchor, 18, 10, 30).toISOString(),
      allDay: false,
      color: '#7c3aed',
      isRunning: false,
      recurrenceFrequency: 'none',
      recurrenceInterval: 1,
      recurrenceUntil: null,
      isRecurringInstance: false,
      source: 'mock',
    },
    {
      id: `${userId}-mock-5`,
      persistentId: `${userId}-mock-5`,
      title: 'Team offsite',
      description: 'All-day planning and team bonding.',
      startsAt: createTimedDate(monthAnchor, 23, 0).toISOString(),
      endsAt: addHours(createTimedDate(monthAnchor, 23, 0), 24).toISOString(),
      seriesStartsAt: createTimedDate(monthAnchor, 23, 0).toISOString(),
      seriesEndsAt: addHours(createTimedDate(monthAnchor, 23, 0), 24).toISOString(),
      allDay: true,
      color: '#db2777',
      isRunning: false,
      recurrenceFrequency: 'none',
      recurrenceInterval: 1,
      recurrenceUntil: null,
      isRecurringInstance: false,
      source: 'mock',
    },
  ]

  return mockEvents.filter((event) => {
    const start = new Date(event.startsAt)
    const end = new Date(event.endsAt)

    return overlapsRange(start, end, rangeStart, rangeEnd)
  })
}
