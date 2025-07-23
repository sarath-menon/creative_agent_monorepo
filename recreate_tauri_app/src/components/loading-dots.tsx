

export function LoadingDots() {
  return (
    <div className="flex space-x-1 items-center">
      <div className="animate-bounce w-1 h-1 bg-gray-400 rounded-full" style={{ animationDelay: '0ms' }}></div>
      <div className="animate-bounce w-1 h-1 bg-gray-400 rounded-full" style={{ animationDelay: '150ms' }}></div>
      <div className="animate-bounce w-1 h-1 bg-gray-400 rounded-full" style={{ animationDelay: '300ms' }}></div>
    </div>
  );
};
