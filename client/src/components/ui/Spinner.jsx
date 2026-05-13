const Spinner = ({ size = 'md', className = '' }) => {
  const sz = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size];
  return (
    <div className={`animate-spin rounded-full border-2 border-gray-200 border-t-primary-600 ${sz} ${className}`} />
  );
};

export const PageLoader = () => (
  <div className="flex h-64 items-center justify-center">
    <Spinner size="lg" />
  </div>
);

export default Spinner;
