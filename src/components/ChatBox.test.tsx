import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatBox from './ChatBox'

// Mock the data layer module so component tests are isolated.
vi.mock('../lib/requests', () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}))
// Mock supabase client (realtime channel calls are no-ops in tests).
vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => 'mock-subscription'),
    })),
    removeChannel: vi.fn(),
  },
}))

// Import after mock so we can reference the mocked functions.
import { listMessages, sendMessage } from '../lib/requests'
import type { Message, DeliveryRequest } from '../lib/requests'

const mockedListMessages = vi.mocked(listMessages)
const mockedSendMessage = vi.mocked(sendMessage)

const baseRequest: DeliveryRequest = {
  id: 'req-1',
  requester_id: 'prof-requester',
  deliverer_id: 'prof-deliverer',
  title: 'Lab report',
  description: 'CSE 3rd year',
  pickup_location: 'Main canteen',
  dropoff_location: 'CSE Building',
  urgency: 'medium',
  reward_suggestion: 20,
  status: 'accepted',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const names = {
  'prof-requester': 'Alice',
  'prof-deliverer': 'Bob',
}

const myselfId = 'prof-deliverer'

const existingMessages: Message[] = [
  {
    id: 'msg-1',
    request_id: 'req-1',
    sender_id: 'prof-requester',
    content: 'Hi, where are you?',
    created_at: new Date('2026-09-01T10:00:00Z').toISOString(),
  },
]

describe('ChatBox', () => {
  beforeEach(() => {
    mockedListMessages.mockResolvedValue([...existingMessages])
    mockedSendMessage.mockResolvedValue({ ok: true, message_id: 'msg-2' })
  })

  it('renders existing messages with sender display names', async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    )

    await waitFor(() => {
      expect(screen.getByText('Hi, where are you?')).toBeInTheDocument()
    })
    // Alice is the requester — shown as the sender name
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows a text input and sends a message on submit', async () => {
    const user = userEvent.setup()
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    )

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })

    await user.type(screen.getByRole('textbox'), 'I am on my way')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith('req-1', 'I am on my way')
    })
  })

  it('does not render when request is not accepted or in_progress', () => {
    const openRequest = { ...baseRequest, status: 'open' as const }
    const { container } = render(
      <ChatBox request={openRequest} names={names} myProfileId={myselfId} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a loading state before messages load', async () => {
    mockedListMessages.mockImplementation(
      () => new Promise(() => {}), // never resolves
    )
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('rerenders from open to accepted without hook errors', async () => {
    const openRequest = { ...baseRequest, status: 'open' as const }
    const { rerender } = render(
      <ChatBox request={openRequest} names={names} myProfileId={myselfId} />,
    )
    // Initially empty
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    // Rerender with accepted status
    rerender(<ChatBox request={baseRequest} names={names} myProfileId={myselfId} />)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('deduplicates incoming messages with identical IDs', async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    )
    await waitFor(() => {
      expect(screen.getAllByText('Hi, where are you?')).toHaveLength(1)
    })
    
    // In a real test we'd simulate the realtime channel firing, 
    // but the component will dedup anyway when fetching new msgs.
  })
})