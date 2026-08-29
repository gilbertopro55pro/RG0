import { SkeletonBlock } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-7 w-32 mb-1.5" />
      <SkeletonBlock className="h-4 w-56 mb-5" />
      <div className="grid grid-cols-2 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="h-48 rounded-2xl mb-5" />
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
