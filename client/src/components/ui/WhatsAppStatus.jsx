import { AlertCircle, Check, CheckCheck } from 'lucide-react';
import { useT } from '../../i18n/index.jsx';

// How far a devotee's WhatsApp message got, like WhatsApp's own ticks: ✓ sent, ✓✓ delivered,
// blue ✓✓ read, or not delivered (with Meta's reason). `whatsapp` = { status, at, error, tries }
// from the server; nothing when no message was sent. Delivered / read need the delivery webhook
// (Settings → WhatsApp); without it a message stays at "sent".
const LOOK = {
  sent:      { Icon: Check,       label: 'Sent',          cls: 'text-gray-500' },
  delivered: { Icon: CheckCheck,  label: 'Delivered',     cls: 'text-gray-600' },
  read:      { Icon: CheckCheck,  label: 'Read',          cls: 'text-sky-600' },
  failed:    { Icon: AlertCircle, label: 'Not delivered', cls: 'text-red-600' },
};

const when = (at) => (at ? new Date(at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function WhatsAppStatus({ whatsapp, showLabel = true, className = '' }) {
  const t = useT();
  const look = LOOK[whatsapp?.status];
  if (!look) return null;
  const { Icon } = look;
  const title = [`WhatsApp: ${t(look.label)}`, when(whatsapp.at), whatsapp.error, whatsapp.tries > 1 && t('{n} tries', { n: whatsapp.tries })]
    .filter(Boolean).join(' · ');
  return (
    <span title={title} aria-label={title} className={`inline-flex items-center gap-1 text-xs font-medium ${look.cls} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {showLabel && <span>{t(look.label)}</span>}
    </span>
  );
}
