import { useLocation } from 'react-router-dom';
import { isTaskRoute } from '../Layout/navConfig.js';

// Primary form/page actions. Phones: pinned to the bottom of the screen so Save is
// always one thumb-tap away (above the tab bar when it's showing — the extra bottom
// padding clears the tab bar's raised "+" button). From `sm` up: an ordinary
// right-aligned button row in the page flow.
// Place it last in the page: on phones it leaves a spacer where it sits in the flow.
const StickyActionBar = ({ children, className = '' }) => {
  const { pathname } = useLocation();
  const aboveTabBar = !isTaskRoute(pathname);

  return (
    <>
      {/* Keeps the last bit of the page scrollable above the pinned bar on phones. */}
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <div
        className={`fixed inset-x-0 z-20 flex gap-2 border-t border-gray-200 bg-white/95 px-4 pt-3 backdrop-blur
          ${aboveTabBar ? 'bottom-tabbar pb-5' : 'bottom-0 pb-[calc(0.75rem+var(--safe-bottom))]'}
          [&>*]:flex-1 sm:[&>*]:flex-none
          sm:static sm:z-auto sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none ${className}`}
      >
        {children}
      </div>
    </>
  );
};

export default StickyActionBar;
