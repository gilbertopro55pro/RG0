import { SkeletonBlock } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-2xl lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-4 w-24 mb-5" />
      <SkeletonBlock className="h-7 w-48 mb-1.5" />
      <SkeletonBlock className="h-4 w-32 mb-5" />
      <div className="flex gap-2 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-1.5">
        {Array.from({ length: 18 }).map((_, i) => (
          <SkeletonBlock key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    </div>
  );
}
