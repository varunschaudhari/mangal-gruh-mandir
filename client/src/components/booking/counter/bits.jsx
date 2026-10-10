// Small shared pieces of the booking counter.

/** Arrow keys / Home / End move the choice inside a role="radiogroup" of buttons (like native radios). */
export function rovingKeyDown(e) {
  const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
  const step = steps[e.key];
  if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
  const items = [...e.currentTarget.querySelectorAll('[role="radio"]:not([disabled])')];
  if (!items.length) return;
  const i = items.indexOf(document.activeElement);
  let n;
  if (step === 'first') n = 0;
  else if (step === 'last') n = items.length - 1;
  else n = i === -1 ? 0 : (i + step + items.length) % items.length;
  e.preventDefault();
  items[n].focus();
  items[n].click();
}

/** Only the chosen radio (or the first one when nothing is chosen) is a Tab stop. */
export const radioTab = (selected, isFirst, anySelected) => (selected || (!anySelected && isFirst) ? 0 : -1);

/** Subtle keyboard hint, desktop only. */
export const Kbd = ({ children, className = '' }) => (
  <kbd className={`hidden lg:inline-block rounded border border-gray-200 bg-gray-50 px-1 font-mono text-[10px] font-semibold leading-4 text-gray-400 ${className}`}>
    {children}
  </kbd>
);

/** Section heading inside the counter form. */
export const SectionTitle = ({ children, right, id }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-gray-500">{children}</h2>
    {right}
  </div>
);

/** On/off switch with a 44px tap target. */
export const Toggle = ({ checked, onChange, children, hint }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex min-h-[44px] w-full items-center gap-3 text-left"
  >
    <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-gray-700">{children}</span>
      {hint && <span className="block text-xs text-gray-400">{hint}</span>}
    </span>
  </button>
);

const HALL_COLORS = ['bg-blue-100 text-blue-800', 'bg-purple-100 text-purple-800', 'bg-teal-100 text-teal-800', 'bg-amber-100 text-amber-800'];

/** Hall code (H1, H2, H3…) with a steady colour per hall so staff can tell them apart at a glance. */
export const HallBadge = ({ hall, className = '' }) => {
  if (!hall) return null;
  const n = Number(String(hall).match(/\d+/)?.[0]);
  const color = Number.isFinite(n) && n > 0 ? HALL_COLORS[(n - 1) % HALL_COLORS.length] : 'bg-gray-100 text-gray-700';
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-bold ${color} ${className}`}>{hall}</span>;
};

/** Short confirmation sound after a booking (silently skipped where audio isn't allowed). */
export function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close?.();
  } catch { /* no audio */ }
}
