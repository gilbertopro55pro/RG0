import { SkeletonBlock } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <SkeletonBlock className="h-4 w-28 mb-5" />
      <SkeletonBlock className="h-8 w-52 mb-5" />
      <SkeletonBlock className="aspect-[4/3] rounded-2xl mb-4" />
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 flex-1 rounded-xl" />
        <SkeletonBlock className="h-10 flex-1 rounded-xl" />
      </div>
    </div>
  );
}
