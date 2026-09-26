import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-7 w-32 mb-5" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} lines={1} />
        ))}
      </div>
    </div>
  );
}
