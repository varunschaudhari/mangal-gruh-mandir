import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSetAppBarTitle } from '../Layout/AppBarContext.jsx';

// Below `lg` the title moves into the mobile app bar (with a back button), so the
// in-page heading and breadcrumbs are desktop-only. The dashboard keeps its greeting.
const PageHeader = ({ title, subtitle, actions, breadcrumbs }) => {
  const { pathname } = useLocation();
  const titleInAppBar = pathname !== '/dashboard';
  useSetAppBarTitle(titleInAppBar ? title : null);

  return (
    <div className="mb-4 sm:mb-6">
      {breadcrumbs && (
        <nav className="hidden lg:flex items-center gap-1 text-xs text-gray-500 mb-2 flex-wrap">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              {b.to ? <Link to={b.to} className="hover:text-gray-700">{b.label}</Link> : <span>{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={`text-lg sm:text-xl font-bold text-gray-900 truncate ${titleInAppBar ? 'hidden lg:block' : ''}`}>{title}</h1>
          {subtitle && <p className="lg:mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
};

export default PageHeader;
