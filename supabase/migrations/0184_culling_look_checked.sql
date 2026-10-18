-- Photo culling (owner, 2026-10-18): "מבט לא למצלמה" counts only in posed photos, not candid ones.
-- The first 756 marks were made in candid photos too, so each is checked once against that
-- definition (a grid on /admin/culling). look_checked_at: when the mark was decided with the
-- posed-only definition in mind; every label saved from now on sets it. The engine is measured on
-- "not looking" only where the mark is unset or checked. RLS: the existing culling_labels_own policy.
alter table public.culling_labels add column if not exists look_checked_at timestamptz;
