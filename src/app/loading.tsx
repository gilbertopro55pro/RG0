import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <div className="flex items-center justify-between mb-5">
        <SkeletonBlock className="h-6 w-32" />
        <SkeletonBlock className="h-9 w-9 rounded-full" />
      </div>

      <SkeletonBlock className="h-28 rounded-2xl mb-5" />

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16 rounded-2xl" />
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
