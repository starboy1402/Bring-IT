import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BrowseRequestsPage from './BrowseRequestsPage'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/requests', () => ({
  listOpenRequests: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'prof-1' } }),
}))

import { listOpenRequests, type DeliveryRequest } from '../lib/requests'
const mockedListOpenRequests = vi.mocked(listOpenRequests)

describe('BrowseRequestsPage', () => {
  beforeEach(() => {
    mockedListOpenRequests.mockReset()
  })

  function renderPage() {
    render(
      <MemoryRouter>
        <BrowseRequestsPage />
      </MemoryRouter>
    )
  }

  it('shows loading state initially', () => {
    mockedListOpenRequests.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows failure state and allows retry', async () => {
    const user = userEvent.setup()
    mockedListOpenRequests.mockRejectedValueOnce(new Error('Network error'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument())

    mockedListOpenRequests.mockResolvedValueOnce([])
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(screen.getByText(/no open requests right now/i)).toBeInTheDocument())
  })

  it('handles Load More and terminal state', async () => {
    const user = userEvent.setup()
    const req1 = { id: 'req-1', title: 'First', urgency: 'high', status: 'open', created_at: '2026-09-01' } as DeliveryRequest

    mockedListOpenRequests.mockResolvedValueOnce(Array(20).fill(req1))
    renderPage()

    await waitFor(() => expect(screen.getAllByText('First').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument()

    // Click load more, get 0 items -> terminal state
    mockedListOpenRequests.mockResolvedValueOnce([])
    await user.click(screen.getByRole('button', { name: /load more/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument())
  })

  it('discards stale Load More results if urgency filter changes in flight', async () => {
    const user = userEvent.setup()
    const req1 = { id: 'req-1', title: 'High Urgency 1', urgency: 'high', status: 'open', created_at: '2026-09-01' } as DeliveryRequest

    mockedListOpenRequests.mockResolvedValueOnce(Array(20).fill(req1))
    renderPage()
    await waitFor(() => expect(screen.getAllByText('High Urgency 1').length).toBeGreaterThan(0))

    // Start Load More (high urgency)
    let resolveLoadMore: (value: DeliveryRequest[]) => void
    const loadMorePromise = new Promise<DeliveryRequest[]>((resolve) => { resolveLoadMore = resolve })
    mockedListOpenRequests.mockReturnValueOnce(loadMorePromise)

    await user.click(screen.getByRole('button', { name: /load more/i }))

    // Change filter to Low urgency while Load More is in flight
    const reqLow = { id: 'req-low', title: 'Low Urgency 1', urgency: 'low', status: 'open', created_at: '2026-09-02' } as DeliveryRequest
    mockedListOpenRequests.mockResolvedValueOnce([reqLow])

    await user.selectOptions(screen.getByRole('combobox'), 'low')

    // Wait for the Low urgency fetch to finish
    await waitFor(() => expect(screen.getByText('Low Urgency 1')).toBeInTheDocument())
    expect(screen.queryByText('High Urgency 1')).not.toBeInTheDocument()

    // Now resolve the stale Load More (high urgency)
    const staleReq = { id: 'stale', title: 'Stale High Urgency', urgency: 'high', status: 'open', created_at: '2026-09-03' } as DeliveryRequest
    await act(async () => {
      resolveLoadMore([staleReq])
    })

    // Check that stale data did not pollute the list
    expect(screen.queryByText('Stale High Urgency')).not.toBeInTheDocument()
    expect(screen.getByText('Low Urgency 1')).toBeInTheDocument()
  })
})
