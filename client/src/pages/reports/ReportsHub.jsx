import { Link } from 'react-router-dom';
import { ChevronRight, BarChart3, BarChart2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { navConfig } from '../../components/Layout/navConfig.js';
import { usePermissions } from '../../hooks/usePermissions.js';

// Other modules' reports, listed alongside the stock reports.
const EXTRA_REPORTS = [
  { label: 'Mahaprasad Report', to: '/mahaprasad/report', icon: BarChart3, permission: 'mahaprasad:read' },
  { label: 'Asset Reports',     to: '/assets/reports',    icon: BarChart2, permission: 'assets:read' },
];

// Landing page for the mobile "Reports" tab: every report the user can open.
const ReportsHub = () => {
  const { can } = usePermissions();
  const stockReports = navConfig.find((g) => g.label === 'Reports')?.children || [];
  const reports = [...stockReports, ...EXTRA_REPORTS].filter((r) => !r.permission || can(r.permission));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Reports" subtitle="Stock, finance and temple activity reports" />
      <div className="card divide-y divide-gray-100 overflow-hidden">
        {reports.map((r) => (
          <Link key={r.to} to={r.to} className="flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 hover:bg-gray-50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <r.icon className="h-5 w-5" />
            </span>
            <span className="flex-1 text-sm font-medium text-gray-800">{r.label}</span>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ReportsHub;
