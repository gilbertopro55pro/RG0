import { SkeletonBlock } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-11 w-11 rounded-full mb-5" />
      <SkeletonBlock className="h-7 w-40 mb-1.5" />
      <SkeletonBlock className="h-4 w-64 mb-5" />
      <SkeletonBlock className="h-8 w-72 rounded-full mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className={`h-20 rounded-2xl ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`} />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
