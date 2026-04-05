import { addDays, format, isValid, subDays } from 'date-fns'
import type { CSSProperties, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { z } from 'zod'

import type { CalendarEventInput, RecurrenceFrequency } from '@/types/calendar'

const COLOR_PRESETS = ['#0f766e', '#2563eb', '#ca8a04', '#7c3aed', '#db2777', '#dc2626'] as const
const RECURRENCE_OPTIONS: Array<{ label: string; value: RecurrenceFrequency }> = [
  { label: 'Does not repeat', value: 'none' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
]

const eventEditorSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.'),
  color: z.string().trim().min(4, 'Choose a color.'),
})

type EditorMode = 'create' | 'edit'

export interface EventEditorDraft {
  id?: string
  mode: EditorMode
  title: string
  description: string | null
  start: Date
  end: Date
  allDay: boolean
  color: string
  recurrenceFrequency: RecurrenceFrequency
  recurrenceInterval: number
  recurrenceUntil: string | null
}

interface EventEditorSheetProps {
  draft: EventEditorDraft | null
  isBusy: boolean
  error: string | null
  onClose: () => void
  onDelete: (eventId: string) => Promise<void>
  onSave: (eventId: string | undefined, payload: CalendarEventInput) => Promise<void>
}

interface EditorFormState {
  title: string
  description: string
  allDay: boolean
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  color: string
  recurrenceFrequency: RecurrenceFrequency
  recurrenceInterval: string
  recurrenceUntilDate: string
}

const toDateField = (value: Date): string => format(value, 'yyyy-MM-dd')
const toTimeField = (value: Date): string => format(value, 'HH:mm')

const parseDateTime = (dateValue: string, timeValue: string): Date => new Date(`${dateValue}T${timeValue}:00`)

const createInitialState = (draft: EventEditorDraft): EditorFormState => ({
  title: draft.title,
  description: draft.description ?? '',
  allDay: draft.allDay,
  startDate: toDateField(draft.start),
  endDate: toDateField(draft.allDay ? subDays(draft.end, 1) : draft.end),
  startTime: toTimeField(draft.start),
  endTime: toTimeField(draft.end),
  color: draft.color || COLOR_PRESETS[0],
  recurrenceFrequency: draft.recurrenceFrequency,
  recurrenceInterval: String(draft.recurrenceInterval),
  recurrenceUntilDate: draft.recurrenceUntil ? toDateField(new Date(draft.recurrenceUntil)) : '',
})

interface EventEditorFormProps {
  draft: EventEditorDraft
  isBusy: boolean
  error: string | null
  onClose: () => void
  onDelete: (eventId: string) => Promise<void>
  onSave: (eventId: string | undefined, payload: CalendarEventInput) => Promise<void>
}

const EventEditorForm = ({
  draft,
  isBusy,
  error,
  onClose,
  onDelete,
  onSave,
}: EventEditorFormProps) => {
  const [form, setForm] = useState<EditorFormState>(() => createInitialState(draft))
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        onClose()
      }
    }

    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('keydown', onEscape)
    }
  }, [isBusy, onClose])

  const panelTitle = draft.mode === 'create' ? 'New Event' : 'Edit Event'

  const setField = <K extends keyof EditorFormState>(key: K, value: EditorFormState[K]): void => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError(null)

    const parsedFields = eventEditorSchema.safeParse({
      title: form.title,
      color: form.color,
    })

    if (!parsedFields.success) {
      const [firstIssue] = parsedFields.error.issues
      setValidationError(firstIssue?.message ?? 'Please check your event details.')
      return
    }

    const normalizedStart = form.allDay
      ? new Date(`${form.startDate}T00:00:00`)
      : parseDateTime(form.startDate, form.startTime)

    const normalizedEnd = form.allDay
      ? addDays(new Date(`${form.endDate}T00:00:00`), 1)
      : parseDateTime(form.endDate, form.endTime)

    if (!isValid(normalizedStart) || !isValid(normalizedEnd)) {
      setValidationError('Start and end date values must be valid.')
      return
    }

    if (normalizedEnd <= normalizedStart) {
      setValidationError('Event end must be after event start.')
      return
    }

    const normalizedRecurrenceInterval = Math.max(1, Number.parseInt(form.recurrenceInterval, 10) || 1)
    const recurrenceUntilIso =
      form.recurrenceFrequency === 'none'
        ? null
        : form.recurrenceUntilDate
          ? new Date(`${form.recurrenceUntilDate}T23:59:59`).toISOString()
          : null

    await onSave(draft.id, {
      title: parsedFields.data.title,
      description: form.description.trim() || null,
      startsAt: normalizedStart.toISOString(),
      endsAt: normalizedEnd.toISOString(),
      allDay: form.allDay,
      color: parsedFields.data.color,
      recurrenceFrequency: form.recurrenceFrequency,
      recurrenceInterval: normalizedRecurrenceInterval,
      recurrenceUntil: recurrenceUntilIso,
    })
  }

  const handleDelete = async () => {
    if (!draft.id) {
      return
    }

    const shouldDelete = window.confirm('Delete this event? This action cannot be undone.')

    if (!shouldDelete) {
      return
    }

    await onDelete(draft.id)
  }

  return (
    <section
      aria-label={panelTitle}
      aria-modal="true"
      className="event-editor-sheet"
      onMouseDown={(event) => event.stopPropagation()}
      role="dialog"
    >
      <header className="event-editor-header">
        <div className="event-editor-title-block">
          <p className="eyebrow">Event Manager</p>
          <h2>{panelTitle}</h2>
        </div>
        <button className="btn subtle event-editor-close" disabled={isBusy} onClick={onClose} type="button">
          Close
        </button>
      </header>

      <form className="event-editor-form" onSubmit={(event) => void handleSubmit(event)}>
        <section className="editor-section">
          <label className="field">
            <span>Title</span>
            <input
              autoFocus
              disabled={isBusy}
              maxLength={120}
              onChange={(event) => setField('title', event.target.value)}
              placeholder="What is happening?"
              required
              value={form.title}
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              disabled={isBusy}
              onChange={(event) => setField('description', event.target.value)}
              placeholder="Notes, links, attendees..."
              rows={4}
              value={form.description}
            />
          </label>
        </section>

        <section className="editor-section">
          <h3 className="editor-section-title">When</h3>
          <label className="field checkbox-field">
            <input
              checked={form.allDay}
              disabled={isBusy}
              onChange={(event) => setField('allDay', event.target.checked)}
              type="checkbox"
            />
            <span>All-day event</span>
          </label>

          <div className="event-time-grid">
            <label className="field">
              <span>Start date</span>
              <input
                disabled={isBusy}
                onChange={(event) => setField('startDate', event.target.value)}
                required
                type="date"
                value={form.startDate}
              />
            </label>

            {!form.allDay ? (
              <label className="field">
                <span>Start time</span>
                <input
                  disabled={isBusy}
                  onChange={(event) => setField('startTime', event.target.value)}
                  required
                  type="time"
                  value={form.startTime}
                />
              </label>
            ) : null}

            <label className="field">
              <span>End date</span>
              <input
                disabled={isBusy}
                onChange={(event) => setField('endDate', event.target.value)}
                required
                type="date"
                value={form.endDate}
              />
            </label>

            {!form.allDay ? (
              <label className="field">
                <span>End time</span>
                <input
                  disabled={isBusy}
                  onChange={(event) => setField('endTime', event.target.value)}
                  required
                  type="time"
                  value={form.endTime}
                />
              </label>
            ) : null}
          </div>
        </section>

        <section className="editor-section editor-section-row">
          <label className="field">
            <span>Color</span>
            <div className="color-row">
              {COLOR_PRESETS.map((preset) => (
                <button
                  aria-label={`Use color ${preset}`}
                  className={preset === form.color ? 'color-dot active' : 'color-dot'}
                  disabled={isBusy}
                  key={preset}
                  onClick={() => setField('color', preset)}
                  style={{ '--event-color': preset } as CSSProperties}
                  type="button"
                />
              ))}
              <input
                aria-label="Custom event color"
                className="color-input"
                disabled={isBusy}
                onChange={(event) => setField('color', event.target.value)}
                type="color"
                value={form.color}
              />
            </div>
          </label>
        </section>

        <section className="editor-section">
          <h3 className="editor-section-title">Repeat</h3>
          <div className="recurrence-grid">
            <label className="field">
              <span>Frequency</span>
              <select
                disabled={isBusy}
                onChange={(event) =>
                  setField('recurrenceFrequency', event.target.value as RecurrenceFrequency)
                }
                value={form.recurrenceFrequency}
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {form.recurrenceFrequency !== 'none' ? (
              <label className="field">
                <span>Every</span>
                <div className="recurrence-interval-row">
                  <input
                    disabled={isBusy}
                    min={1}
                    onChange={(event) => setField('recurrenceInterval', event.target.value)}
                    step={1}
                    type="number"
                    value={form.recurrenceInterval}
                  />
                  <span className="recurrence-interval-label">{form.recurrenceFrequency}</span>
                </div>
              </label>
            ) : null}

            {form.recurrenceFrequency !== 'none' ? (
              <label className="field">
                <span>Repeat until</span>
                <input
                  disabled={isBusy}
                  onChange={(event) => setField('recurrenceUntilDate', event.target.value)}
                  type="date"
                  value={form.recurrenceUntilDate}
                />
              </label>
            ) : null}
          </div>
        </section>

        {validationError ? <p className="status-note error">{validationError}</p> : null}
        {error ? <p className="status-note error">{error}</p> : null}

        <footer className="event-editor-actions">
          {draft.mode === 'edit' && draft.id ? (
            <button className="btn danger" disabled={isBusy} onClick={() => void handleDelete()} type="button">
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="event-editor-actions-right">
            <button className="btn subtle" disabled={isBusy} onClick={onClose} type="button">
              Cancel
            </button>
            <button className="btn primary" disabled={isBusy} type="submit">
              {isBusy ? 'Saving...' : draft.mode === 'create' ? 'Create Event' : 'Save Changes'}
            </button>
          </div>
        </footer>
      </form>
    </section>
  )
}

export const EventEditorSheet = ({
  draft,
  isBusy,
  error,
  onClose,
  onDelete,
  onSave,
}: EventEditorSheetProps) => {
  if (!draft) {
    return null
  }

  const draftKey = `${draft.mode}-${draft.id ?? draft.start.toISOString()}-${draft.end.toISOString()}`

  return (
    <div className="event-editor-overlay" onMouseDown={isBusy ? undefined : onClose} role="presentation">
      <EventEditorForm
        draft={draft}
        error={error}
        isBusy={isBusy}
        key={draftKey}
        onClose={onClose}
        onDelete={onDelete}
        onSave={onSave}
      />
    </div>
  )
}
