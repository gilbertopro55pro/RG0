"use client";

import dynamic from "next/dynamic";

// The tasks panel's code loads only when it's opened, from the home screen's button or the nav.
const LazyTasksPanel = dynamic(() => import("@/components/tasks/TasksPanel"), { ssr: false });

export default LazyTasksPanel;
