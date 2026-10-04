import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-4 w-24 mb-5" />
      <SkeletonBlock className="h-7 w-48 mb-1.5" />
      <SkeletonBlock className="h-4 w-36 mb-5" />
      <SkeletonBlock className="h-24 rounded-2xl mb-5" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
