import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import ChatBox from "./ChatBox";

// Mock the data layer module so component tests are isolated.
vi.mock("../lib/requests", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

type PostgresChangesPayload = { new: Partial<Message> };
let mockOnPostgresChanges: {
  filter: Record<string, unknown>;
  callback: (payload: PostgresChangesPayload) => void;
} | null = null;
let mockSubscribe: ((status: string) => void) | null = null;

function triggerPostgresChange(payload: PostgresChangesPayload) {
  if (!mockOnPostgresChanges) throw new Error("mockOnPostgresChanges is null");
  mockOnPostgresChanges.callback(payload);
}

function triggerSubscribe(status: string) {
  if (!mockSubscribe) throw new Error("mockSubscribe is null");
  mockSubscribe(status);
}

function getMockPostgresFilter() {
  if (!mockOnPostgresChanges) throw new Error("mockOnPostgresChanges is null");
  return mockOnPostgresChanges.filter;
}
const channelMock = {
  on: vi.fn().mockImplementation((event, filter, callback) => {
    if (event === "postgres_changes")
      mockOnPostgresChanges = { filter, callback };
    return channelMock;
  }),
  subscribe: vi.fn().mockImplementation((callback) => {
    mockSubscribe = callback;
    return channelMock;
  }),
};

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: vi.fn(),
  },
}));

import { listMessages, sendMessage } from "../lib/requests";
import { supabase } from "../lib/supabase";
import type { Message, DeliveryRequest } from "../lib/requests";

const mockedListMessages = vi.mocked(listMessages);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedChannel = vi.mocked(supabase.channel);

const baseRequest: DeliveryRequest = {
  id: "req-1",
  requester_id: "prof-requester",
  deliverer_id: "prof-deliverer",
  title: "Lab report",
  description: "CSE 3rd year",
  pickup_location: "Main canteen",
  dropoff_location: "CSE Building",
  urgency: "medium",
  reward_suggestion: 20,
  status: "accepted",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const names = {
  "prof-requester": "Alice",
  "prof-deliverer": "Bob",
};

const myselfId = "prof-deliverer";

const existingMessages: Message[] = [
  {
    id: "msg-1",
    request_id: "req-1",
    sender_id: "prof-requester",
    content: "Hi, where are you?",
    created_at: "2026-09-01T10:00:00Z",
  },
];

describe("ChatBox", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedListMessages.mockResolvedValue([...existingMessages]);
    mockedSendMessage.mockResolvedValue({ ok: true, message_id: "msg-new" });
    mockOnPostgresChanges = null;
    mockSubscribe = null;
    mockedChannel.mockClear();
    vi.mocked(supabase.removeChannel).mockClear();
    mockedListMessages.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders existing messages with sender display names", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Hi, where are you?")).toBeInTheDocument();
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("configures server-side filter correctly", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    expect(mockedChannel).toHaveBeenCalledWith("messages:request_id=eq.req-1");
    expect(getMockPostgresFilter()).toEqual({
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: "request_id=eq.req-1",
    });
  });

  it("deduplicates incoming messages with identical IDs", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Hi, where are you?")).toBeInTheDocument();
    });
    // Fire realtime insert for the SAME message ID
    act(() => {
      triggerPostgresChange({
        new: { ...existingMessages[0], content: "Duplicate" },
      });
    });
    // Because IDs match, the merge logic should just keep one. Note that our merge logic replaces the older with newer or keeps one.
    // The length should still be 1.
    const items = screen.getAllByText(/Hi, where are you\?|Duplicate/);
    expect(items).toHaveLength(1);
  });

  it("sorts out-of-order events deterministically by (created_at, id)", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Hi, where are you?")).toBeInTheDocument();
    });

    // Fire messages out of order
    const msg2 = {
      id: "msg-2",
      request_id: "req-1",
      sender_id: "prof-requester",
      content: "Message B",
      created_at: "2026-09-01T10:02:00Z",
    };
    const msg3 = {
      id: "msg-3",
      request_id: "req-1",
      sender_id: "prof-requester",
      content: "Message A",
      created_at: "2026-09-01T10:01:00Z",
    };

    act(() => {
      triggerPostgresChange({ new: msg2 });
      triggerPostgresChange({ new: msg3 });
    });

    await waitFor(() => {
      expect(screen.getByText("Message A")).toBeInTheDocument();
    });

    // Check DOM order
    const messages = screen.getAllByText(/Message A|Message B/);
    expect(messages[0]).toHaveTextContent("Message A");
    expect(messages[1]).toHaveTextContent("Message B");
  });

  it("tie-breaks equal timestamps using IDs", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => screen.getByText("Hi, where are you?"));

    const time = "2026-09-01T10:05:00Z";
    // id 'b' and 'a' should be ordered 'a' then 'b'
    const msgB = {
      id: "b",
      request_id: "req-1",
      sender_id: "prof-requester",
      content: "Second",
      created_at: time,
    };
    const msgA = {
      id: "a",
      request_id: "req-1",
      sender_id: "prof-requester",
      content: "First",
      created_at: time,
    };

    act(() => {
      triggerPostgresChange({ new: msgB });
      triggerPostgresChange({ new: msgA });
    });

    const messages = screen.getAllByText(/First|Second/);
    expect(messages[0]).toHaveTextContent("First");
    expect(messages[1]).toHaveTextContent("Second");
  });

  it("shows Reconnecting state on CHANNEL_ERROR and triggers delayed polling", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => screen.getByText("Hi, where are you?"));
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();

    // Simulate error
    act(() => {
      triggerSubscribe("CHANNEL_ERROR");
    });
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();

    mockedListMessages.mockClear();
    // Wait for 15s to trigger polling
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(mockedListMessages).toHaveBeenCalled(); // Polling fired
  });

  it("recovers on SUBSCRIBED and performs backfill", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => screen.getByText("Hi, where are you?"));
    mockedListMessages.mockClear();

    // Reconnecting state
    act(() => {
      triggerSubscribe("CHANNEL_ERROR");
    });
    expect(screen.getByText("Reconnecting…")).toBeInTheDocument();

    // Recover
    act(() => {
      triggerSubscribe("SUBSCRIBED");
    });
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();

    // Backfill fetch should have happened immediately
    await waitFor(() => {
      expect(mockedListMessages).toHaveBeenCalled();
    });
  });

  it("performs periodic backfill even when realtime is SUBSCRIBED", async () => {
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => screen.getByText("Hi, where are you?"));
    mockedListMessages.mockClear();

    // Channel is SUBSCRIBED
    act(() => {
      triggerSubscribe("SUBSCRIBED");
    });

    // After 5s, backfill should fire
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockedListMessages).toHaveBeenCalled();

    // And again at 10s
    mockedListMessages.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockedListMessages).toHaveBeenCalled();
  });

  it("resets state and cursor safely when request ID changes via key", async () => {
    const { rerender } = render(
      <ChatBox key="req-1" request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => screen.getByText("Hi, where are you?"));

    const request2 = { ...baseRequest, id: "req-2" };
    mockedListMessages.mockResolvedValueOnce([]); // Empty for new req

    // Changing the key forces React to unmount/remount with fresh state
    rerender(
      <ChatBox key="req-2" request={request2} names={names} myProfileId={myselfId} />,
    );

    // Should clear old messages
    await waitFor(() => {
      expect(screen.queryByText("Hi, where are you?")).not.toBeInTheDocument();
    });
    // Channel cleanup
    expect(supabase.removeChannel).toHaveBeenCalled();
    // Channel subscription to new req
    expect(mockedChannel).toHaveBeenCalledWith("messages:request_id=eq.req-2");
  });

  it("shows error message on send failure instead of alert", async () => {
    mockedSendMessage.mockResolvedValueOnce({ ok: false, code: "RATE_LIMITED", message: "Rate limited" });
    render(
      <ChatBox request={baseRequest} names={names} myProfileId={myselfId} />,
    );
    await waitFor(() => screen.getByText("Hi, where are you?"));

    await act(async () => {
      await fireEvent.change(screen.getByPlaceholderText("Type a message…"), {
        target: { value: "Test message" },
      });
      await fireEvent.click(screen.getByRole("button", { name: /Send/i }));
    });

    expect(screen.getByText("Rate limited")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Rate limited");
  });
});
