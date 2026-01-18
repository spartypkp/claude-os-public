'use client';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer rounded ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
