import { cn } from '../../lib/cn';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export function Skeleton({ className, width, height, rounded }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse',
        rounded ? 'rounded-full' : '',
        className,
      )}
      style={{
        width,
        height,
        background: 'linear-gradient(90deg, rgba(15,33,50,0.5) 0%, rgba(25,46,68,0.6) 50%, rgba(15,33,50,0.5) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          className={i === lines - 1 ? 'w-2/3' : 'w-full'}
        />
      ))}
    </div>
  );
}
