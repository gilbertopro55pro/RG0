-- Six new built-in package flows for freelance-only bookings (no album, no full production
-- pipeline) — see PACKAGE_FLOWS in src/lib/stages.ts for the actual stage lists. The four
-- "freelance_video_film*" values are the sub-choices of one grouped option in the new-event
-- form's package select ("פרילנס וידאו כולל עריכה" — see NewEventModal.tsx's nested
-- "מה כולל העריכה" dropdown); they're separate PackageType values (not a new column) so the
-- existing package-driven stage-generation logic in POST /api/events needs no branching changes.
alter table public.events
  drop constraint events_package_check,
  add constraint events_package_check
    check (package in (
      'stills', 'stills_reel', 'stills_video', 'full', 'full_second',
      'freelance_stills', 'freelance_video_raw',
      'freelance_video_film', 'freelance_video_film_clip',
      'freelance_video_film_clip_teaser', 'freelance_video_film_clip_reels'
    ));
