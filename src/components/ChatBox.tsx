import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { DeliveryRequest, Message } from '../lib/requests'
import { listMessages, sendMessage } from '../lib/requests'
import { Card } from './Badges'

interface ChatBoxProps {
  request: DeliveryRequest
  names: Record<string, string>
  myProfileId: string
}

const CHAT_STATUSES: DeliveryRequest['status'][] = ['accepted', 'in_progress']

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const map = new Map<string, Message>()
  for (const m of existing) map.set(m.id, m)
  for (const m of incoming) map.set(m.id, m)
  const merged = Array.from(map.values())
  merged.sort((a, b) => {
    if (a.created_at === b.created_at) {
      return a.id.localeCompare(b.id)
    }
    return a.created_at.localeCompare(b.created_at)
  })
  return merged
}

export default function ChatBox({ request, names, myProfileId }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState('pending')
  const [isReconnecting, setIsReconnecting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  
  // Track cursors for backfill/polling
  const cursorRef = useRef<{ createdAt: string; id: string } | null>(null)

  const isChatActive = CHAT_STATUSES.includes(request.status)

  // A stable helper to fetch and merge
  const fetchAndMerge = useCallback(async (mounted: { current: boolean }) => {
    try {
      const currentRequestId = request.id
      const newMsgs = await listMessages(currentRequestId, cursorRef.current || undefined)
      if (!mounted.current || request.id !== currentRequestId) return
      if (newMsgs.length > 0) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, newMsgs)
          const last = merged[merged.length - 1]
          cursorRef.current = { createdAt: last.created_at, id: last.id }
          return merged
        })
      }
    } finally {
      if (mounted.current) {
        setLoading(false)
        // Scroll slightly delayed to ensure DOM updated
        setTimeout(() => bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' }), 0)
      }
    }
  }, [request.id])

  useEffect(() => {
    if (!isChatActive) return
    const mounted = { current: true }

    // Initial fetch
    void fetchAndMerge(mounted)

    let pollInterval: ReturnType<typeof setInterval> | null = null
    const startPolling = () => {
      if (!pollInterval) {
        void fetchAndMerge(mounted)
        pollInterval = setInterval(() => {
          void fetchAndMerge(mounted)
        }, 15000)
      }
    }
    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    }

    // Periodic backfill: runs even when realtime is SUBSCRIBED to catch dropped events.
    // Uses composite cursor so it only fetches new messages.
    const backfillInterval = setInterval(() => {
      void fetchAndMerge(mounted)
    }, 5000)

    let realtimeUnavailableTimeout: ReturnType<typeof setTimeout> | null = null

    const channel = supabase
      .channel(`messages:request_id=eq.${request.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `request_id=eq.${request.id}` },
        (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.request_id === request.id) {
            setMessages((prev) => {
              const merged = mergeMessages(prev, [newMsg])
              const last = merged[merged.length - 1]
              cursorRef.current = { createdAt: last.created_at, id: last.id }
              return merged
            })
            setTimeout(() => bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' }), 0)
          }
        },
      )
      .subscribe((status) => {
        setRealtimeStatus(status)
        if (status === 'SUBSCRIBED') {
          setIsReconnecting(false)
          // Re-fetch in case we missed events while connecting/reconnecting
          void fetchAndMerge(mounted)
          
          stopPolling()
          if (realtimeUnavailableTimeout) {
            clearTimeout(realtimeUnavailableTimeout)
            realtimeUnavailableTimeout = null
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          setIsReconnecting(true)
          // Fallback to polling after 15s of unavailability
          if (!realtimeUnavailableTimeout) {
            realtimeUnavailableTimeout = setTimeout(() => {
              startPolling()
            }, 15000)
          }
        }
      })

    return () => {
      mounted.current = false
      stopPolling()
      clearInterval(backfillInterval)
      if (realtimeUnavailableTimeout) clearTimeout(realtimeUnavailableTimeout)
      supabase.removeChannel(channel)
    }
  }, [request.id, isChatActive, fetchAndMerge])

  async function handleSend() {
    if (!content.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await sendMessage(request.id, content.trim())
      if (res.ok) {
        setContent('')
        void fetchAndMerge({ current: true })
      } else {
        setError(res.message || 'Failed to send message')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (!isChatActive) return null

  return (
    <div data-realtime-status={realtimeStatus}>
      <Card className="border-slate-200/80">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-900 text-sm sm:text-base">Live Coordination Chat</h2>
            {realtimeStatus === 'SUBSCRIBED' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          {isReconnecting && (
            <span className="text-xs font-medium text-amber-600 animate-pulse">Reconnecting…</span>
          )}
        </div>

        <div className="h-52 space-y-3 overflow-y-auto px-1 py-1" aria-live="polite">
          {loading && (
            <div className="flex justify-center py-6">
              <p className="text-xs text-slate-400">Loading messages…</p>
            </div>
          )}
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-xs font-medium text-slate-400">No messages yet. Say hello to coordinate pickup!</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.sender_id === myProfileId
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <span className="mb-0.5 text-[10px] font-medium text-slate-600 px-1">
                  {names[msg.sender_id] ?? (isMine ? 'You' : 'Peer')}
                </span>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-2xs ${
                    isMine
                      ? 'bg-emerald-800 text-white rounded-tr-xs'
                      : 'bg-slate-100 text-slate-900 border border-slate-200/80 rounded-tl-xs'
                  }`}
                >
                  <p className="break-words">{msg.content}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-600" role="alert">{error}</p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSend()
          }}
          className="mt-3 flex gap-2 border-t border-slate-100 pt-3"
        >
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a message…"
            disabled={sending}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
          />
          <button
            type="submit"
            disabled={sending || !content.trim()}
            className="rounded-xl bg-emerald-800 px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-900 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            Send
          </button>
        </form>
      </Card>
    </div>
  )
}
