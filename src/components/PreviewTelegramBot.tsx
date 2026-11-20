import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Gift,
  LifeBuoy,
  MessageSquareReply,
  Send,
  ShieldAlert,
  Smartphone,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';
import type {
  BotDmMessage,
  PaymentProvider,
  PreviewAdminGroupLog,
  PreviewIncomingSms,
  PreviewOrder,
  PreviewProduct,
  PreviewSupportTicket,
} from '../previewData';
import { PreviewVpnQrCode, isPreviewVpnUri } from './PreviewVpnQrCode';

interface PreviewTelegramBotProps {
  orders: PreviewOrder[];
  products: PreviewProduct[];
  dmMessages: BotDmMessage[];
  supportTickets: PreviewSupportTicket[];
  incomingSmsList: PreviewIncomingSms[];
  adminGroupLogs: PreviewAdminGroupLog[];
  onApproveOrder: (orderId: string, actorName: string) => void;
  onRejectOrder: (orderId: string, reason: string, actorName: string) => void;
  onSimulateIncomingSms: (input: {
    rawMessage?: string;
    provider?: PaymentProvider;
    transactionId?: string;
    amountMmk?: number;
    senderInfo?: string;
  }) => { matchedOrderNumber: string | null; sms: PreviewIncomingSms };
  onEscalateOrderNow: (orderId: string) => void;
  onCustomerCommand: (cmd: '/start' | '/myorders' | '/support') => void;
  onSubmitSupportTicket: (message: string, referencedOrderNumber?: string | null) => void;
  onAdminReplyTicket: (ticketId: string, replyText: string, actorName: string) => void;
  onOpenMiniApp: (prefillPromoCode?: string) => void;
}

const TELEGRAM_REJECT_REASONS = [
  { code: 'amount', label: 'Wrong Amount', text: 'Transfer amount does not match the order total.' },
  {
    code: 'blurry',
    label: 'Blurry Slip',
    text: 'Receipt screenshot is blurry or missing transaction details.',
  },
  {
    code: 'duplicate',
    label: 'Duplicate Tx ID',
    text: 'This receipt or transaction ID has already been used.',
  },
  {
    code: 'unverified',
    label: 'Payment Not Received',
    text: 'Payment could not be found in merchant KPay/WavePay history.',
  },
];

export function PreviewTelegramBot({
  orders,
  products,
  dmMessages,
  supportTickets,
  incomingSmsList,
  adminGroupLogs,
  onApproveOrder,
  onRejectOrder,
  onSimulateIncomingSms,
  onEscalateOrderNow,
  onCustomerCommand,
  onSubmitSupportTicket,
  onAdminReplyTicket,
  onOpenMiniApp,
}: PreviewTelegramBotProps) {
  const [rejectOpenForOrderId, setRejectOpenForOrderId] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  const [customerInput, setCustomerInput] = useState('');
  const [replyTargetOrderNumber, setReplyTargetOrderNumber] = useState<string | null>(null);
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const [smsDraft, setSmsDraft] = useState(
    'KBZPay: Received 25,000.00 MMK from Kyaw Zin (0977112233). Trans ID: 010099482910.'
  );
  const [smsFeedback, setSmsFeedback] = useState<string | null>(null);

  const lowStockItems = products.filter((p) => p.isActive && p.availableKeys.length < 5);
  const latestPendingOrder = orders.find((o) => o.status === 'PENDING_APPROVAL') ?? null;
  const waitingSmsOrders = orders.filter(
    (o) => o.status === 'PENDING_APPROVAL' && o.escalatedToAdminGroup === false
  );
  const groupOrders = orders.filter((o) => o.escalatedToAdminGroup !== false);

  async function handleCopyCode(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSecret(text);
      setTimeout(() => setCopiedSecret(null), 1500);
    } catch {
      // ignore
    }
  }

  function handleSendCustomerInput(e: React.FormEvent) {
    e.preventDefault();
    const raw = customerInput.trim();
    if (!raw) return;

    if (raw === '/start' || raw === '/myorders' || raw === '/support') {
      onCustomerCommand(raw);
      setCustomerInput('');
      return;
    }

    const cleanedMessage = raw.startsWith('/support ') ? raw.slice('/support '.length).trim() : raw;
    if (!cleanedMessage) return;

    onSubmitSupportTicket(cleanedMessage, replyTargetOrderNumber);
    setCustomerInput('');
    setReplyTargetOrderNumber(null);
  }

  function handlePushRawSms(e: React.FormEvent) {
    e.preventDefault();
    const raw = smsDraft.trim();
    if (!raw) return;
    const res = onSimulateIncomingSms({ rawMessage: raw });
    setSmsFeedback(
      res.matchedOrderNumber
        ? `Instant Auto-Verified & Unlocked ${res.matchedOrderNumber} (${res.sms.amountMmk.toLocaleString('en-US')} MMK)!`
        : `Saved ${res.sms.provider} SMS #${res.sms.transactionId} (${res.sms.amountMmk.toLocaleString('en-US')} MMK) to ledger (unmatched).`
    );
  }

  function handlePushMatchingPendingSms() {
    if (!latestPendingOrder) return;
    const txId =
      latestPendingOrder.ocrExtractedTxId ||
      `010099${latestPendingOrder.transactionLast6 || '551199'}`;
    const raw =
      latestPendingOrder.paymentProvider === 'KPAY'
        ? `KBZPay: Received ${latestPendingOrder.totalMmk.toLocaleString('en-US')}.00 MMK from ${latestPendingOrder.customerLabel.split(' ')[0]}. Trans ID: ${txId}.`
        : `WavePay: You received ${latestPendingOrder.totalMmk.toLocaleString('en-US')} MMK from 0977112233. Ref ID: ${txId}.`;
    setSmsDraft(raw);
    const res = onSimulateIncomingSms({
      rawMessage: raw,
      provider: latestPendingOrder.paymentProvider,
      transactionId: txId,
      amountMmk: latestPendingOrder.totalMmk,
      senderInfo: latestPendingOrder.customerLabel,
    });
    setSmsFeedback(
      res.matchedOrderNumber
        ? `Instant Auto-Verified & Unlocked ${res.matchedOrderNumber}!`
        : `Pushed SMS #${txId} to ledger.`
    );
  }

  function handleSendAdminTicketReply(e: React.FormEvent, ticketId: string) {
    e.preventDefault();
    const draft = (ticketReplies[ticketId] ?? '').trim();
    if (!draft) return;
    onAdminReplyTicket(ticketId, draft, '@admin_mgmg');
    setTicketReplies((prev) => ({ ...prev, [ticketId]: '' }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left Pane: Admin Telegram Group Simulator */}
      <section className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#121826] overflow-hidden">
        <div className="border-b border-white/[0.08] bg-[#182133] px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-50">
            Admin Telegram Group (@MMKeyHubAdmins)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Orders arrive with receipts & inline buttons; /support & warranty claims relay here for
            direct reply.
          </p>
        </div>

        <div className="flex-1 space-y-4 p-4 sm:p-5 max-h-[640px] overflow-y-auto">
          {/* Incoming Phone SMS Forwarder Simulator */}
          <div className="rounded-xl border border-emerald-500/30 bg-[#0B0F17] p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Incoming Phone SMS Webhook Simulator</span>
              </div>
              <span className="font-mono-tabular text-[11px] text-slate-400">
                Ledger: {incomingSmsList.length} SMS
              </span>
            </div>

            {latestPendingOrder && (
              <button
                type="button"
                onClick={handlePushMatchingPendingSms}
                className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
              >
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Push Matching Bank SMS for {latestPendingOrder.orderNumber} (
                  {latestPendingOrder.totalMmk.toLocaleString('en-US')} MMK)
                </span>
              </button>
            )}

            <form onSubmit={handlePushRawSms} className="flex gap-2">
              <input
                type="text"
                value={smsDraft}
                onChange={(e) => setSmsDraft(e.target.value)}
                placeholder="Paste KBZPay / WavePay SMS alert..."
                className="font-mono-tabular min-h-[36px] flex-1 rounded-lg border border-white/[0.12] bg-[#121826] px-2.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[36px] shrink-0 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                Push SMS
              </button>
            </form>

            {smsFeedback && (
              <p className="text-[11px] font-medium text-emerald-300">{smsFeedback}</p>
            )}
          </div>

          {/* 60s SMS Matching Window Orders */}
          {waitingSmsOrders.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                Waiting in 60s SMS Auto-Match Window ({waitingSmsOrders.length})
              </p>
              {waitingSmsOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs"
                >
                  <div>
                    <p className="font-mono-tabular font-semibold text-amber-200">
                      {ord.orderNumber} · {ord.totalMmk.toLocaleString('en-US')} MMK
                    </p>
                    <p className="text-[11px] text-amber-100/80">
                      AI OCR Clean ({Math.round((ord.ocrConfidenceScore ?? 0.99) * 100)}%) — holding
                      admin alert for 60s SMS arrival
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEscalateOrderNow(ord.id)}
                    className="rounded-lg border border-amber-400/40 bg-[#0B0F17] px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                  >
                    Escalate Now
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Passive 24/7 Auto-Verified & Delivered Logs */}
          {adminGroupLogs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                ✅ 24/7 Auto-Verified Logs (Passive Feed)
              </p>
              {adminGroupLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>✅ Auto-Verified &amp; Delivered</span>
                    </span>
                    <span className="font-mono-tabular text-[11px] text-slate-400">
                      {log.timestamp}
                    </span>
                  </div>
                  <p className="font-mono-tabular text-slate-100">
                    {log.orderNumber} · {log.provider} · {log.amountMmk.toLocaleString('en-US')} MMK
                  </p>
                  <p className="text-[11px] text-slate-300">
                    {log.productTitleEn} × {log.quantity} · Tx #{log.transactionId}
                    {log.confidenceScore != null
                      ? ` · AI OCR ${Math.round(log.confidenceScore * 100)}%`
                      : ''}
                  </p>
                  <p className="text-[11px] text-emerald-300/90">
                    {log.dmSent
                      ? 'Key delivered automatically to Web Tracker & Customer DM.'
                      : 'Key unlocked automatically on Web Order Tracker.'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {supportTickets.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
                Forwarded Support & Warranty Tickets ({supportTickets.length})
              </p>
              {supportTickets.map((tkt) => (
                <div
                  key={tkt.id}
                  className="rounded-xl border border-sky-500/25 bg-[#0B0F17] p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono-tabular font-semibold text-sky-300">
                      {tkt.ticketNumber}
                    </span>
                    <span className="font-mono-tabular text-slate-400">
                      {tkt.orderNumber ? `Order: ${tkt.orderNumber}` : 'General Support'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">From: {tkt.customerLabel}</p>
                  <p className="rounded-lg border border-white/[0.06] bg-[#121826] p-2.5 text-xs text-slate-100 leading-relaxed">
                    {tkt.message}
                  </p>

                  {tkt.status === 'OPEN' ? (
                    <form
                      onSubmit={(e) => handleSendAdminTicketReply(e, tkt.id)}
                      className="flex gap-2 pt-1"
                    >
                      <input
                        type="text"
                        value={ticketReplies[tkt.id] ?? ''}
                        onChange={(e) =>
                          setTicketReplies((prev) => ({ ...prev, [tkt.id]: e.target.value }))
                        }
                        placeholder="Reply to forward straight to customer DM..."
                        className="min-h-[38px] flex-1 rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-slate-950 hover:bg-sky-400 cursor-pointer"
                      >
                        <MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Reply DM</span>
                      </button>
                    </form>
                  ) : (
                    <div className="border-t border-white/[0.08] pt-2 text-xs">
                      <p className="font-medium text-emerald-400">
                        Replied by {tkt.repliedBy ?? '@admin_mgmg'} · Sent to Customer DM
                      </p>
                      <p className="mt-1 text-slate-300">“{tkt.adminReply}”</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Admin Group Approval / Fallback Queue ({groupOrders.length})
            </p>
            {groupOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Escalated or suspicious orders appear here with inline buttons.
              </p>
            ) : (
              groupOrders.map((order) => {
                const isPending = order.status === 'PENDING_APPROVAL';
                const showingReasons = rejectOpenForOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="rounded-xl border border-white/[0.08] bg-[#0B0F17] p-4 space-y-3"
                  >
                    {order.receiptDataUrl && (
                      <img
                        src={order.receiptDataUrl}
                        alt={`Receipt for ${order.orderNumber}`}
                        className="max-h-52 w-full rounded-lg border border-white/[0.08] object-contain bg-slate-950"
                      />
                    )}

                    {order.ocrTamperingFlags && order.ocrTamperingFlags.length > 0 && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs text-amber-200">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>MANUAL REVIEW · AI VISION OCR FLAG</span>
                        </div>
                        <ul className="mt-1 list-disc pl-4 text-[11px] space-y-0.5">
                          {order.ocrTamperingFlags.map((flag) => (
                            <li key={flag}>{flag}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {order.isDuplicateTxWarning && (
                      <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                        <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>⚠️ DUPLICATE TX ID WARNING</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-rose-200/90">
                          Tx #{order.transactionLast6} matches previously approved order{' '}
                          <span className="font-mono-tabular font-semibold">
                            {order.duplicateTxOrderNumber ?? 'Earlier Order'}
                          </span>
                          . Verify your KPay/WavePay ledger before approving.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1 text-xs leading-relaxed text-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-50">
                          {order.verificationMode === 'MANUAL_REVIEW'
                            ? 'Manual Verification Required'
                            : 'Order Alert'}
                        </p>
                        {order.ocrConfidenceScore != null && (
                          <span className="font-mono-tabular text-[11px] text-slate-400">
                            AI OCR: {Math.round(order.ocrConfidenceScore * 100)}%
                          </span>
                        )}
                      </div>
                      <p>
                        Order:{' '}
                        <span className="font-mono-tabular text-emerald-300">
                          {order.orderNumber}
                        </span>
                      </p>
                      <p>
                        Amount:{' '}
                        <span className="font-mono-tabular font-semibold text-slate-50">
                          {order.totalMmk.toLocaleString('en-US')} MMK
                        </span>
                        {order.discountMmk > 0 && (
                          <span className="ml-2 font-mono-tabular text-emerald-400">
                            (-{order.discountMmk.toLocaleString('en-US')} MMK · Promo{' '}
                            {order.promoCode})
                          </span>
                        )}
                      </p>
                      <p>
                        Payment: <span className="font-semibold">{order.paymentProvider}</span>
                        {order.transactionLast6 ? ` · Tx #${order.transactionLast6}` : ''}
                      </p>
                      <p>Customer: {order.customerLabel}</p>
                      <p>
                        Product:{' '}
                        {order.items && order.items.length > 1
                          ? order.items
                              .map((i) => `${i.productTitleEn} × ${i.quantity}`)
                              .join(', ')
                          : `${order.productTitleEn} × ${order.quantity}`}
                      </p>
                    </div>

                    {isPending ? (
                      showingReasons ? (
                        <div className="space-y-2 border-t border-white/[0.08] pt-3">
                          <p className="text-xs font-medium text-amber-300">
                            Select rejection reason:
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {TELEGRAM_REJECT_REASONS.map((r) => (
                              <button
                                key={r.code}
                                type="button"
                                onClick={() => {
                                  onRejectOrder(order.id, r.text, '@admin_mgmg');
                                  setRejectOpenForOrderId(null);
                                }}
                                className="min-h-[38px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20 cursor-pointer"
                              >
                                {r.label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setRejectOpenForOrderId(null)}
                            className="w-full rounded-lg border border-white/[0.1] py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                          >
                            Back
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onApproveOrder(order.id, '@admin_mgmg')}
                            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Approve & Send Key</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectOpenForOrderId(order.id)}
                            className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )
                    ) : (
                      <div
                        className={`border-t border-white/[0.08] pt-2.5 text-xs font-medium ${
                          order.status === 'APPROVED' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {order.status === 'APPROVED'
                          ? `${order.verificationMode === 'AUTO_VERIFIED' ? 'Auto-Verified' : `Approved by ${order.reviewedBy ?? 'Admin'}`} · Key sent`
                          : `Rejected by ${order.reviewedBy ?? 'Admin'} · ${order.rejectionReason}`}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {lowStockItems.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                <span>Low Stock Alerts (&lt; 5)</span>
              </div>
              <ul className="mt-1.5 space-y-1">
                {lowStockItems.map((item) => (
                  <li key={item.id} className="font-mono-tabular">
                    {item.titleEn}: {item.availableKeys.length} left
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Right Pane: Customer Telegram Bot DM (@MMKeyHubBot) */}
      <section className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#121826] overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#182133] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">
              Customer Bot DM (@MMKeyHubBot)
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Test /start, /myorders, /support &lt;issue&gt;, key replies, promo broadcasts & expiry
              alerts.
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-3 p-4 sm:p-5 max-h-[500px] overflow-y-auto">
          {dmMessages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[92%] rounded-xl p-3.5 text-xs leading-relaxed ${
                msg.sender === 'USER'
                  ? 'ml-auto bg-emerald-500 text-slate-950 font-medium'
                  : 'border border-white/[0.08] bg-[#0B0F17] text-slate-200'
              }`}
            >
              {msg.photoUrl && (
                <img
                  src={msg.photoUrl}
                  alt="Broadcast promo banner"
                  className="mb-2.5 max-h-40 w-full rounded-lg border border-white/[0.08] object-cover"
                />
              )}

              <p className="whitespace-pre-line">{msg.text}</p>

              {msg.codeBlocks && msg.codeBlocks.length > 0 && (
                <div className="mt-2.5 space-y-2">
                  {msg.codeBlocks.map((code) => (
                    <div key={code} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-[#121826] px-2.5 py-2">
                        <code className="font-mono-tabular break-all text-emerald-300">{code}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopyCode(code)}
                          className="shrink-0 rounded-md bg-[#182133] p-1.5 text-slate-200 hover:text-emerald-300 cursor-pointer"
                          aria-label="Copy credential"
                        >
                          {copiedSecret === code ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {isPreviewVpnUri(code) && (
                        <div className="flex justify-start">
                          <PreviewVpnQrCode value={code} size={96} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {msg.sender === 'BOT' && msg.text.includes('Welcome to MMKeyHub') && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onOpenMiniApp()}
                    className="flex min-h-[38px] w-full items-center justify-center rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    Open Mini App / ဆိုင်ဖွင့်ရန်
                  </button>
                  <button
                    type="button"
                    onClick={() => onCustomerCommand('/support')}
                    className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#121826] px-3 text-xs font-medium text-slate-200 hover:border-sky-500/50 cursor-pointer"
                  >
                    <LifeBuoy className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                    <span>Support / Warranty Claim</span>
                  </button>
                </div>
              )}

              {msg.sender === 'BOT' && msg.orderNumberTag && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyTargetOrderNumber(msg.orderNumberTag ?? null);
                    setCustomerInput('Key not activating, please help check warranty');
                  }}
                  className="mt-2.5 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                >
                  <MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reply to {msg.orderNumberTag} (Warranty Claim)</span>
                </button>
              )}

              {msg.sender === 'BOT' && msg.promoCodeCta && (
                <button
                  type="button"
                  onClick={() => onOpenMiniApp(msg.promoCodeCta ?? undefined)}
                  className="mt-2.5 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                >
                  <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Claim Promo {msg.promoCodeCta} in Storefront</span>
                </button>
              )}

              <p
                className={`mt-1.5 text-[10px] ${
                  msg.sender === 'USER' ? 'text-slate-900/70' : 'text-slate-500'
                }`}
              >
                {msg.timestamp}
              </p>
            </div>
          ))}
        </div>

        {/* Quick Commands + Custom Support Input */}
        <div className="space-y-2.5 border-t border-white/[0.08] bg-[#0B0F17] p-3">
          {replyTargetOrderNumber && (
            <div className="flex items-center justify-between rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300">
              <span>
                Replying to delivered key for{' '}
                <strong className="font-mono-tabular">{replyTargetOrderNumber}</strong>
              </span>
              <button
                type="button"
                onClick={() => setReplyTargetOrderNumber(null)}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onCustomerCommand('/start')}
              className="flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-white/[0.12] bg-[#121826] px-2 text-xs font-medium text-slate-200 hover:border-emerald-500/50 cursor-pointer"
            >
              <span>/start</span>
            </button>
            <button
              type="button"
              onClick={() => onCustomerCommand('/myorders')}
              className="flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-white/[0.12] bg-[#121826] px-2 text-xs font-medium text-slate-200 hover:border-emerald-500/50 cursor-pointer"
            >
              <span>/myorders</span>
            </button>
            <button
              type="button"
              onClick={() => onCustomerCommand('/support')}
              className="flex min-h-[36px] items-center justify-center gap-1 rounded-lg border border-white/[0.12] bg-[#121826] px-2 text-xs font-medium text-sky-300 hover:border-sky-500/50 cursor-pointer"
            >
              <span>/support</span>
            </button>
          </div>

          <form onSubmit={handleSendCustomerInput} className="flex gap-2">
            <input
              type="text"
              value={customerInput}
              onChange={(e) => setCustomerInput(e.target.value)}
              placeholder={
                replyTargetOrderNumber
                  ? `Describe issue with ${replyTargetOrderNumber}...`
                  : 'Type /support <message> or send a question...'
              }
              className="min-h-[40px] flex-1 rounded-xl border border-white/[0.12] bg-[#121826] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
