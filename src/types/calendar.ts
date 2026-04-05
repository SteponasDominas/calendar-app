export type CalendarEventSource = 'supabase' | 'demo' | 'mock'
export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface CalendarEvent {
  id: string
  persistentId: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  seriesStartsAt: string
  seriesEndsAt: string
  allDay: boolean
  color: string
  isRunning: boolean
  recurrenceFrequency: RecurrenceFrequency
  recurrenceInterval: number
  recurrenceUntil: string | null
  isRecurringInstance: boolean
  source: CalendarEventSource
}

export interface CalendarEventInput {
  title: string
  description?: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  color?: string
  recurrenceFrequency?: RecurrenceFrequency
  recurrenceInterval?: number
  recurrenceUntil?: string | null
}

export interface CalendarEventUpdate {
  id: string
  title?: string
  description?: string | null
  startsAt?: string
  endsAt?: string
  allDay?: boolean
  color?: string
  isRunning?: boolean
  recurrenceFrequency?: RecurrenceFrequency
  recurrenceInterval?: number
  recurrenceUntil?: string | null
}
