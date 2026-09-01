import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RatingForm from './RatingForm'
import type { DeliveryRequest, Rating } from '../lib/requests'

vi.mock('../lib/requests', () => ({
  submitRating: vi.fn(),
  getMyRatings: vi.fn(),
}))

import { submitRating, getMyRatings } from '../lib/requests'

const mockedSubmitRating = vi.mocked(submitRating)
const mockedGetMyRatings = vi.mocked(getMyRatings)

const deliveredRequest: DeliveryRequest = {
  id: 'req-1',
  requester_id: 'prof-requester',
  deliverer_id: 'prof-deliverer',
  title: 'Lab report',
  description: null,
  pickup_location: 'Main canteen',
  dropoff_location: 'CSE Building',
  urgency: 'medium',
  reward_suggestion: 20,
  status: 'delivered',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('RatingForm', () => {
  beforeEach(() => {
    mockedGetMyRatings.mockResolvedValue([])
    mockedSubmitRating.mockResolvedValue({ ok: true, rating_id: 'rating-1' })
  })

  it('renders for the requester after delivery, rating the deliverer', async () => {
    render(
      <RatingForm
        request={deliveredRequest}
        myProfileId="prof-requester"
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /rate your deliverer/i }),
      ).toBeInTheDocument()
    })
  })

  it('renders for the deliverer after delivery, rating the requester', async () => {
    render(
      <RatingForm
        request={deliveredRequest}
        myProfileId="prof-deliverer"
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /rate your requester/i }),
      ).toBeInTheDocument()
    })
  })

  it('does not render before delivery is complete', () => {
    const acceptedRequest = { ...deliveredRequest, status: 'accepted' as const }
    const { container } = render(
      <RatingForm request={acceptedRequest} myProfileId="prof-requester" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('does not render if already rated', async () => {
    const myRating: Rating = {
      id: 'r-1',
      request_id: 'req-1',
      rater_id: 'prof-requester',
      ratee_id: 'prof-deliverer',
      role: 'as_requester',
      score: 5,
      comment: 'Great!',
      created_at: new Date().toISOString(),
    }
    mockedGetMyRatings.mockResolvedValue([myRating])
    render(
      <RatingForm request={deliveredRequest} myProfileId="prof-requester" />,
    )

    await waitFor(() => {
      expect(screen.getByText(/already rated/i)).toBeInTheDocument()
    })
  })

  it('submits 4 stars with a comment', async () => {
    const user = userEvent.setup()
    render(
      <RatingForm request={deliveredRequest} myProfileId="prof-requester" />,
    )

    await waitFor(() => screen.getByRole('button', { name: /submit rating/i }))

    // Click the 4th star
    const stars = screen.getAllByRole('button', { name: /star/i })
    await user.click(stars[3])
    await user.type(
      screen.getByLabelText(/comment/i),
      'Quick and reliable',
    )
    await user.click(screen.getByRole('button', { name: /submit rating/i }))

    await waitFor(() => {
      expect(mockedSubmitRating).toHaveBeenCalledWith(
        'req-1',
        'prof-deliverer',
        'as_requester',
        4,
        'Quick and reliable',
      )
    })
  })

  it('rerenders from unavailable to available without hook errors', async () => {
    const acceptedRequest = { ...deliveredRequest, status: 'accepted' as const }
    const { rerender } = render(
      <RatingForm request={acceptedRequest} myProfileId="prof-requester" />,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()

    rerender(
      <RatingForm request={deliveredRequest} myProfileId="prof-requester" />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /rate your deliverer/i }),
      ).toBeInTheDocument()
    })
  })
})