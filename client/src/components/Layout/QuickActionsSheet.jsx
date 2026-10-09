import { useNavigate } from 'react-router-dom';
import Sheet from '../ui/Sheet.jsx';
import { useMobileNav } from '../../hooks/useMobileNav.js';
import haptics from '../../utils/haptics.js';

const TONES = {
  orange: 'bg-orange-50 text-orange-600',
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-green-50 text-green-600',
  pink:   'bg-pink-50 text-pink-600',
};

// Opened from the centre "+" tab: one tap to the most common data-entry screens.
const QuickActionsSheet = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { quickActions } = useMobileNav();

  const go = (to) => {
    haptics.tap();
    onClose();
    navigate(to);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Quick actions" size="md">
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map((a) => (
          <button
            key={a.to}
            onClick={() => go(a.to)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2 py-4 text-center shadow-sm active:scale-[0.97] active:bg-gray-50 transition-transform"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TONES[a.tone]}`}>
              <a.icon className="h-6 w-6" />
            </span>
            <span className="text-xs font-semibold leading-tight text-gray-700">{a.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
};

export default QuickActionsSheet;
