-- The card's own style (mat thickness, inner-cutout corner rounding, drop shadow) — shared by both
-- orientations of one design, so it lives alongside landscape_elements/portrait_elements rather
-- than duplicated per orientation. Default matches DEFAULT_MAGNET_FRAME_SETTINGS in
-- magnetFrameShared.ts.
alter table public.magnet_frame_designs
  add column frame_settings jsonb not null default '{"borderRatioPct":12,"cornerRadiusPct":0,"shadowEnabled":true,"shadowOpacity":28,"shadowBlurPx":24,"shadowDistancePx":10}'::jsonb;
