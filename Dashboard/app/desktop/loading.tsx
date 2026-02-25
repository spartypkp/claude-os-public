import { Loader2 } from 'lucide-react';

export default function DesktopLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400 dark:text-[#808080]" />
    </div>
  );
}
