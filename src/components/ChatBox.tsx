import { useEffect, useRef, useState } from 'react'
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

export default function ChatBox({ request, names, myProfileId }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const isChatActive = CHAT_STATUSES.includes(request.status)

  useEffect(() => {
    if (!isChatActive) return
    let mounted = true
    listMessages(request.id)
      .then((msgs) => {
        if (mounted) setMessages(msgs)
      })
      .finally(() => {
        if (mounted) setLoading(false)
        bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
      })

    // Realtime: append new messages broadcast on the channel.
    // The subscription only opens for request_ids the user already authorized.
    const channel = supabase
      .channel(`messages:request_id=eq.${request.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new as Message
          if (newMsg.request_id === request.id) {
            setMessages((prev) => [...prev, newMsg])
          }
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [request.id, isChatActive])

  async function handleSend() {
    if (!content.trim() || sending) return
    setSending(true)
    try {
      const res = await sendMessage(request.id, content.trim())
      if (res.ok) {
        setContent('')
      }
    } finally {
      setSending(false)
    }
  }

  if (!isChatActive) return null

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-900">Chat</h2>
      <div className="h-48 space-y-2 overflow-y-auto">
        {loading && <p className="text-sm text-slate-500">Loading messages…</p>}
        {messages.map((msg) => {
          const isMine = msg.sender_id === myProfileId
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMine ? 'self-end' : ''}`}
            >
              <span className="text-xs font-medium text-slate-600">
                {names[msg.sender_id] ?? 'Someone'}
              </span>
              <p className="text-sm text-slate-800">{msg.content}</p>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </Card>
  )
}