const variants = {
  green:  'bg-green-100 text-green-800',
  red:    'bg-red-100 text-red-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  blue:   'bg-blue-100 text-blue-800',
  gray:   'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-800',
};

const Badge = ({ children, variant = 'gray', className = '' }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
    {children}
  </span>
);

export const ActiveBadge = ({ isActive }) => (
  <Badge variant={isActive ? 'green' : 'gray'}>{isActive ? 'Active' : 'Inactive'}</Badge>
);

export default Badge;
