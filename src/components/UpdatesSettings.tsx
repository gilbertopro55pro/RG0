import { CHANGELOG, changesFor } from "@/lib/changelog";
import { getLang, getT } from "@/i18n/server";
import UpdateEntryCard from "@/components/UpdateEntryCard";
import OlderUpdates from "@/components/OlderUpdates";

// The latest versions only: the whole history (~280KB of text) was rendered into the settings page
// on every visit, ~800KB of HTML, whichever tab was open. The rest loads on demand (api/changelog).
export const RECENT_UPDATES = 8;

export default async function UpdatesSettings() {
  const t = await getT();
  const lang = await getLang();
  return (
    <div className="space-y-3">
      {CHANGELOG.slice(0, RECENT_UPDATES).map((entry) => (
        <UpdateEntryCard key={entry.version} label={t("גרסה {v}", { v: entry.version })} date={entry.date} changes={changesFor(entry, lang)} />
      ))}
      {CHANGELOG.length > RECENT_UPDATES && <OlderUpdates from={RECENT_UPDATES} count={CHANGELOG.length - RECENT_UPDATES} />}
    </div>
  );
}
