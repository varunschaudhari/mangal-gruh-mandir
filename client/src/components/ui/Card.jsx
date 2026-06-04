import { Link } from 'react-router-dom';

export const Card = ({ children, className = '' }) => (
  <div className={`card p-6 ${className}`}>{children}</div>
);

export const StatCard = ({ label, value, icon: Icon, color = 'text-primary-600', bg = 'bg-primary-50', border = 'border-l-primary-500', to }) => {
  const inner = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="mt-0.5 text-xl sm:text-2xl font-bold text-gray-800">{value ?? '—'}</p>
      </div>
      {Icon && (
        <div className={`rounded-full p-2 sm:p-3 shrink-0 ${bg}`}>
          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${color}`} />
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className={`card p-3 sm:p-4 border-l-4 ${border} hover:shadow-md transition-shadow cursor-pointer`}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={`card p-3 sm:p-4 border-l-4 ${border}`}>
      {inner}
    </div>
  );
};

export default Card;
