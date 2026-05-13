export const Card = ({ children, className = '' }) => (
  <div className={`card p-6 ${className}`}>{children}</div>
);

export const StatCard = ({ label, value, icon: Icon, color = 'text-primary-600', bg = 'bg-primary-50', border = 'border-l-primary-500' }) => (
  <div className={`card p-5 border-l-4 ${border}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-gray-800">{value ?? '—'}</p>
      </div>
      {Icon && (
        <div className={`rounded-full p-3 ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      )}
    </div>
  </div>
);

export default Card;
