import { AlertCircle, RefreshCw } from 'lucide-react';
import { classifyFrontendError, type ClassifiedError } from '@/lib/classify-error';

interface ChatErrorCardProps {
  error: unknown;
  onRetry?: () => void;
}

export function ChatErrorCard({ error, onRetry }: ChatErrorCardProps) {
  const classified: ClassifiedError = classifyFrontendError(error);

  return (
    <div className="flex justify-start">
      <div className="rounded-lg px-4 py-3 text-sm max-w-md border border-destructive/20 bg-destructive/5">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-destructive font-medium">{classified.message}</p>
            {classified.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="mt-2 flex items-center gap-1.5 text-xs text-destructive/80 hover:text-destructive transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
