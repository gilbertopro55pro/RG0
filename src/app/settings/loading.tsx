import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-4 w-28 mb-5" />
      <SkeletonBlock className="h-7 w-24 mb-5" />
      <div className="flex gap-2 mb-5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 w-20 rounded-full shrink-0" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    </div>
  );
}
