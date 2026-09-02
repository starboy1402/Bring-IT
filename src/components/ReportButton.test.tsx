import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportButton from './ReportButton'

vi.mock('../lib/requests', () => ({
  submitReport: vi.fn(),
}))

import { submitReport } from '../lib/requests'

const mockedSubmitReport = vi.mocked(submitReport)

describe('ReportButton', () => {
  beforeEach(() => {
    mockedSubmitReport.mockReset()
    mockedSubmitReport.mockResolvedValue({ ok: true, report_id: 'report-1' })
  })

  it('starts collapsed and opens an inline form', async () => {
    const user = userEvent.setup()
    render(
      <ReportButton requestId="req-1" targetId="prof-bob" targetName="Bob" />,
    )

    const toggle = screen.getByRole('button', { name: /report/i })
    await user.click(toggle)

    expect(screen.getByLabelText(/reason/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/details/i)).toBeInTheDocument()
  })

  it('validates a too-short reason locally', async () => {
    const user = userEvent.setup()
    render(
      <ReportButton requestId="req-1" targetId="prof-bob" targetName="Bob" />,
    )
    await user.click(screen.getByRole('button', { name: /report/i }))
    await user.type(screen.getByLabelText(/reason/i), 'ab')
    await user.click(screen.getByRole('button', { name: /submit report/i }))

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/between 3 and 200/i)
    expect(mockedSubmitReport).not.toHaveBeenCalled()
  })

  it('submits the report and confirms', async () => {
    const user = userEvent.setup()
    render(
      <ReportButton requestId="req-1" targetId="prof-bob" targetName="Bob" />,
    )
    await user.click(screen.getByRole('button', { name: /report/i }))
    await user.type(screen.getByLabelText(/reason/i), 'Harassment in chat')
    await user.type(
      screen.getByLabelText(/details/i),
      'Sent repeated abusive messages.',
    )
    await user.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(mockedSubmitReport).toHaveBeenCalledWith({
        requestId: 'req-1',
        targetId: 'prof-bob',
        reason: 'Harassment in chat',
        description: 'Sent repeated abusive messages.',
      })
    })
    expect(
      await screen.findByText(/our moderators will review/i),
    ).toBeInTheDocument()
  })

  it('surfaces a failed submission message', async () => {
    const user = userEvent.setup()
    mockedSubmitReport.mockResolvedValue({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many reports. Try again later.',
    })
    render(
      <ReportButton requestId="req-1" targetId="prof-bob" targetName="Bob" />,
    )
    await user.click(screen.getByRole('button', { name: /report/i }))
    await user.type(screen.getByLabelText(/reason/i), 'Third report attempt')
    await user.click(screen.getByRole('button', { name: /submit report/i }))

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/Too many reports/i)
  })
})
