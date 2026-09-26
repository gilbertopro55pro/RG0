import { SkeletonBlock } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <div className="flex items-center justify-between mb-5">
        <SkeletonBlock className="h-7 w-28" />
        <SkeletonBlock className="h-9 w-24 rounded-full" />
      </div>
      <SkeletonBlock className="h-6 w-40 mx-auto mb-4" />
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: 35 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
