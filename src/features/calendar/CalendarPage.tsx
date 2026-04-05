import {
  addDays,
  addHours,
  addSeconds,
  differenceInSeconds,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  subDays,
} from 'date-fns'
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { CalendarEvent, CalendarEventInput } from '@/types/calendar'
import { useAuth } from '@/features/auth/useAuth'

import { EventEditorSheet, type EventEditorDraft } from './EventEditorSheet'
import { useCalendarEvents } from './useCalendarEvents'

interface VisibleRange {
  start: Date
  end: Date
}

const createDefaultRange = (): VisibleRange => {
  const monthStart = startOfMonth(new Date())

  return {
    start: monthStart,
    end: addDays(endOfMonth(monthStart), 1),
  }
}

const getEventEnd = (event: { start: Date | null; end: Date | null; allDay: boolean }): Date | null => {
  if (!event.start) {
    return null
  }

  if (event.end) {
    return event.end
  }

  return event.allDay ? addDays(event.start, 1) : addHours(event.start, 1)
}

const formatElapsed = (startIso: string, now: Date): string => {
  const elapsedSeconds = Math.max(0, differenceInSeconds(now, new Date(startIso)))
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  const paddedMinutes = minutes.toString().padStart(2, '0')
  const paddedSeconds = seconds.toString().padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSeconds}`
  }

  return `${minutes}:${paddedSeconds}`
}

const formatEventWindow = (event: CalendarEvent, nowReference: Date): string => {
  const start = new Date(event.startsAt)
  const end = event.isRunning
    ? nowReference > start
      ? nowReference
      : addSeconds(start, 1)
    : new Date(event.endsAt)

  if (event.allDay) {
    const inclusiveEnd = subDays(end, 1)

    if (isSameDay(start, inclusiveEnd)) {
      return format(start, "EEE, MMM d '(All day)'")
    }

    return `${format(start, 'MMM d')} - ${format(inclusiveEnd, 'MMM d')} (All day)`
  }

  if (event.isRunning) {
    return `${format(start, 'EEE, MMM d HH:mm')} - running (${formatElapsed(event.startsAt, nowReference)})`
  }

  return `${format(start, 'EEE, MMM d HH:mm')} - ${format(end, 'HH:mm')}`
}

const toEditorDraftForCreate = (start: Date, end: Date, allDay: boolean): EventEditorDraft => ({
  mode: 'create',
  title: '',
  description: '',
  start,
  end,
  allDay,
  color: '#0f766e',
  recurrenceFrequency: 'none',
  recurrenceInterval: 1,
  recurrenceUntil: null,
})

const toEditorDraftForEdit = (event: CalendarEvent): EventEditorDraft => ({
  id: event.persistentId,
  mode: 'edit',
  title: event.title,
  description: event.description,
  start: new Date(event.seriesStartsAt),
  end: new Date(event.seriesEndsAt),
  allDay: event.allDay,
  color: event.color,
  recurrenceFrequency: event.recurrenceFrequency,
  recurrenceInterval: event.recurrenceInterval,
  recurrenceUntil: event.recurrenceUntil,
})

export const CalendarPage = () => {
  const { signOut, user } = useAuth()

  const [visibleRange, setVisibleRange] = useState<VisibleRange>(() => createDefaultRange())
  const [editorDraft, setEditorDraft] = useState<EventEditorDraft | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [quickTitle, setQuickTitle] = useState('')
  const [clockTick, setClockTick] = useState<Date>(() => new Date())

  const {
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
  } = useCalendarEvents(visibleRange, user?.id ?? null)

  useEffect(() => {
    if (!activeTrackedEvent) {
      return
    }

    const interval = window.setInterval(() => {
      setClockTick(new Date())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [activeTrackedEvent])

  const calendarEvents = useMemo<EventInput[]>(
    () =>
      events.map((event) => {
        const startDate = new Date(event.startsAt)
        const liveEnd = clockTick > startDate ? clockTick : addSeconds(startDate, 1)

        return {
          id: event.id,
          title: event.isRunning ? `LIVE - ${event.title}` : event.title,
          start: event.startsAt,
          end: event.isRunning ? liveEnd.toISOString() : event.endsAt,
          allDay: event.allDay,
          backgroundColor: event.color,
          borderColor: event.color,
          editable: !event.isRunning && !event.isRecurringInstance,
          durationEditable: !event.isRunning && !event.isRecurringInstance,
          startEditable: !event.isRunning && !event.isRecurringInstance,
          classNames: [
            event.isRunning ? 'running-event' : '',
            event.isRecurringInstance ? 'recurring-event' : '',
          ].filter(Boolean),
          extendedProps: {
            description: event.description,
            source: event.source,
            isRunning: event.isRunning,
            isRecurringInstance: event.isRecurringInstance,
            persistentId: event.persistentId,
          },
        }
      }),
    [clockTick, events],
  )

  const upcomingEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => {
          if (a.isRunning && !b.isRunning) {
            return -1
          }

          if (!a.isRunning && b.isRunning) {
            return 1
          }

          return a.startsAt.localeCompare(b.startsAt)
        })
        .slice(0, 10),
    [events],
  )

  const hasFallbackData = events.some((event) => event.source === 'mock' || event.source === 'demo')
  const liveElapsed = activeTrackedEvent ? formatElapsed(activeTrackedEvent.startsAt, clockTick) : null

  const openCreateEditor = (start: Date, end: Date, allDay: boolean): void => {
    setEditorError(null)
    setEditorDraft(toEditorDraftForCreate(start, end, allDay))
  }

  const openEditEditor = (eventId: string): void => {
    const event = events.find((item) => item.id === eventId)

    if (!event) {
      return
    }

    if (event.isRunning) {
      setEditorError('Stop the active timer before editing this event.')
      return
    }

    setEditorError(null)
    setEditorDraft(toEditorDraftForEdit(event))
  }

  const handleDateSelect = (selection: DateSelectArg): void => {
    const endDate = selection.end ?? (selection.allDay ? addDays(selection.start, 1) : addHours(selection.start, 1))

    openCreateEditor(selection.start, endDate, selection.allDay)
    selection.view.calendar.unselect()
  }

  const handleEventClick = (arg: EventClickArg): void => {
    openEditEditor(arg.event.id)
  }

  const handleDatesSet = (arg: DatesSetArg): void => {
    setVisibleRange({
      start: arg.start,
      end: arg.end,
    })
  }

  const persistDragResize = async (
    eventId: string,
    eventData: { start: Date | null; end: Date | null; allDay: boolean },
  ): Promise<void> => {
    const event = events.find((item) => item.id === eventId)

    if (event?.isRunning) {
      throw new Error('Running event cannot be moved. Stop it first.')
    }

    if (event?.isRecurringInstance) {
      throw new Error('Recurring instances cannot be dragged directly. Edit the series instead.')
    }

    if (!eventData.start) {
      throw new Error('Unable to save event movement because start date is missing.')
    }

    const resolvedEnd = getEventEnd(eventData)

    if (!resolvedEnd) {
      throw new Error('Unable to save event movement because end date is missing.')
    }

    await updateCalendarEvent({
      id: event?.persistentId ?? eventId,
      startsAt: eventData.start.toISOString(),
      endsAt: resolvedEnd.toISOString(),
      allDay: eventData.allDay,
    })
  }

  const handleEventDrop = (arg: EventDropArg): void => {
    void persistDragResize(arg.event.id, {
      start: arg.event.start,
      end: arg.event.end,
      allDay: arg.event.allDay,
    }).catch((saveError) => {
      arg.revert()
      setEditorError(saveError instanceof Error ? saveError.message : 'Unable to move event.')
    })
  }

  const handleEventResize = (arg: EventResizeDoneArg): void => {
    void persistDragResize(arg.event.id, {
      start: arg.event.start,
      end: arg.event.end,
      allDay: arg.event.allDay,
    }).catch((saveError) => {
      arg.revert()
      setEditorError(saveError instanceof Error ? saveError.message : 'Unable to resize event.')
    })
  }

  const handleEditorSave = async (
    eventId: string | undefined,
    payload: CalendarEventInput,
  ): Promise<void> => {
    setEditorError(null)

    try {
      if (eventId) {
        await updateCalendarEvent({
          id: eventId,
          title: payload.title,
          description: payload.description,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          allDay: payload.allDay,
          color: payload.color,
          recurrenceFrequency: payload.recurrenceFrequency,
          recurrenceInterval: payload.recurrenceInterval,
          recurrenceUntil: payload.recurrenceUntil,
        })
      } else {
        await createCalendarEvent(payload)
      }

      setEditorDraft(null)
    } catch (saveError) {
      setEditorError(saveError instanceof Error ? saveError.message : 'Unable to save event.')
    }
  }

  const handleEditorDelete = async (eventId: string): Promise<void> => {
    setEditorError(null)

    try {
      await deleteCalendarEvent(eventId)
      setEditorDraft(null)
    } catch (deleteError) {
      setEditorError(deleteError instanceof Error ? deleteError.message : 'Unable to delete event.')
    }
  }

  const handleQuickStart = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()

    setEditorError(null)

    if (activeTrackedEvent) {
      setEditorError('A timer is already running. Stop it before starting another.')
      return
    }

    try {
      await startTrackedEvent(quickTitle)
      setQuickTitle('')
    } catch (startError) {
      setEditorError(startError instanceof Error ? startError.message : 'Unable to start timer.')
    }
  }

  const handleStopTrackedEvent = async (): Promise<void> => {
    if (!activeTrackedEvent) {
      return
    }

    setEditorError(null)

    try {
      await stopTrackedEvent(activeTrackedEvent.id)
    } catch (stopError) {
      setEditorError(stopError instanceof Error ? stopError.message : 'Unable to stop timer.')
    }
  }

  const combinedEditorError = editorError ?? mutationError

  return (
    <main className="calendar-page">
      <header className="app-header reveal-in">
        <div className="brand-block-wrap">
          <span aria-hidden className="brand-dot" />
          <div className="brand-block">
            <p className="eyebrow">Personal Workspace</p>
            <h1>Calendar</h1>
            <p className="header-date">{format(clockTick, 'EEEE, MMMM d')}</p>
          </div>
        </div>

        <div className="top-actions">
          <p className="signed-in-pill">{user?.email}</p>
          {hasFallbackData ? <span className="source-pill">Fallback data mode</span> : null}
          <button
            className="btn primary"
            onClick={() => openCreateEditor(new Date(), addHours(new Date(), 1), false)}
            type="button"
          >
            New Event
          </button>
          <button className="btn subtle signout-btn" onClick={() => void signOut()} type="button">
            Sign Out
          </button>
        </div>
      </header>

      <section className="quick-track-section reveal-in delay-1">
        <form className="quick-track-form" onSubmit={(event) => void handleQuickStart(event)}>
          <label className="quick-track-label" htmlFor="quick-track-title">
            Quick tracked event
          </label>
          <input
            className="quick-track-input"
            disabled={Boolean(activeTrackedEvent) || isMutating}
            id="quick-track-title"
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder={
              activeTrackedEvent ? 'Timer already running...' : 'What are you working on right now?'
            }
            value={quickTitle}
          />
          <button
            className="btn primary quick-track-start"
            disabled={Boolean(activeTrackedEvent) || isMutating || quickTitle.trim().length === 0}
            type="submit"
          >
            Start
          </button>
        </form>
      </section>

      {activeTrackedEvent ? (
        <section className="active-timer-bar reveal-in">
          <div className="active-timer-meta">
            <p className="eyebrow">Live Tracking</p>
            <h2>{activeTrackedEvent.title}</h2>
            <p>
              Started {format(new Date(activeTrackedEvent.startsAt), 'EEE, MMM d HH:mm')} - Elapsed {liveElapsed}
            </p>
          </div>
          <div className="active-timer-actions">
            <p className="timer-clock">{liveElapsed}</p>
            <button className="btn danger" disabled={isMutating} onClick={() => void handleStopTrackedEvent()} type="button">
              Stop
            </button>
          </div>
        </section>
      ) : null}

      <section className="calendar-layout reveal-in delay-1">
        <div className="calendar-board">
          <div className="calendar-board-head">
            <div>
              <p className="eyebrow">Schedule</p>
              <h2>All events</h2>
            </div>
          </div>
          {isLoading ? <p className="loading-line">Loading events...</p> : null}
          {isMutating ? <p className="loading-line">Saving updates...</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}

          <FullCalendar
            allDaySlot
            datesSet={handleDatesSet}
            dayMaxEvents
            editable
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            eventDurationEditable
            eventResizableFromStart
            eventResize={handleEventResize}
            events={calendarEvents}
            firstDay={1}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            height="auto"
            initialView="dayGridMonth"
            nowIndicator
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            select={handleDateSelect}
            selectMirror
            selectable
            slotMaxTime="24:00:00"
            slotMinTime="00:00:00"
            scrollTime="00:00:00"
            stickyHeaderDates
          />
        </div>

        <aside className="event-panel">
          <div className="event-panel-head">
            <h2>Upcoming</h2>
            <p>{upcomingEvents.length}</p>
          </div>

          {upcomingEvents.length === 0 ? (
            <p className="empty-state">No events yet. Use select or tap "New Event".</p>
          ) : (
            <ul className="event-list">
              {upcomingEvents.map((event) => (
                <li className="event-item event-item-clickable" key={event.id} style={{ '--event-color': event.color } as CSSProperties}>
                  <button
                    className="event-item-button"
                    onClick={() => openEditEditor(event.id)}
                    type="button"
                  >
                    <p className="event-title">{event.title}</p>
                    <p className="event-window">{formatEventWindow(event, clockTick)}</p>
                    {event.isRunning ? <p className="event-live-pill">Running</p> : null}
                    {event.isRecurringInstance ? <p className="event-recurring-pill">Recurring</p> : null}
                    {event.description ? <p className="event-description">{event.description}</p> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </section>

      <button
        aria-label="Create event"
        className="fab-new-event"
        onClick={() => openCreateEditor(new Date(), addHours(new Date(), 1), false)}
        type="button"
      >
        +
      </button>

      <EventEditorSheet
        draft={editorDraft}
        error={combinedEditorError}
        isBusy={isMutating}
        onClose={() => setEditorDraft(null)}
        onDelete={handleEditorDelete}
        onSave={handleEditorSave}
      />
    </main>
  )
}


