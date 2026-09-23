# MEMORY — סיכום פעולות בין שיחות (RG0)

קובץ זה מתעדכן ע"י Claude בסוף כל משימה משמעותית, כדי לשמור על סנכרון בין שיחות שונות.
לקרוא אותו בתחילת כל משימה חדשה.

## 2026-09-23 — פריסת Fly תוקנה, deploy.sh פוצל לשני מסלולים

**הקשר:** PR #14 (עיגול מחיר בבונה הצעות המחיר) מוזג ל-`main` ופורס ל-myframeflow.com דרך Vercel ב-2026-09-22 (מסביבת הענן, עם `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`). באותה משימה נבדק גם FLY_API_TOKEN — **ונמצא שאי אפשר לפרוס ל-Fly מסביבת הענן**: ה-proxy שמיירט TLS בסביבה שובר גם את depot וגם את ה-builder הרגיל של Fly (שגיאות `Forbidden` / `frame with invalid size` / `x509: certificate signed by unknown authority`). זה נבדק בפועל, לא הנחה. `fly status` ו-Machines API (קריאה בלבד) כן עובדים משם.

**הפתרון שהוטמע:**
- `.github/workflows/deploy-pdf-worker.yml` — פורס את שרת ה-PDF ל-Fly אוטומטית בכל push ל-`main`, אבל רק אם קוד צינור הרינדור השתנה (נמנע פריסות מיותרות). דורש GitHub secret בשם `FLY_API_TOKEN` (**המשתמש הוסיף אותו ב-2026-09-23** תחת Settings → Secrets and variables → Actions).
- `scripts/flyWorkerIsCurrent.sh` — סקריפט חדש, בודק דרך Machines API REST (לא flyctl) אם תגית ה-image של כל המכונות החיות שווה ל-`render-<hash>` (אותו hash מ-`scripts/computeRenderHash.js`).
- `scripts/deploy.sh` — כבר **לא** מנסה להריץ `fly deploy` בעצמו. במקום זה, לפני פריסת Vercel, קורא ל-`flyWorkerIsCurrent.sh` ונכשל אם ה-worker עדיין לא עודכן (מכוון את המפעיל לחכות ל-workflow). ניתן לעקוף עם `SKIP_WORKER_CHECK=1`.
- הוסר `.fly-worker-deployed-hash` (קובץ מקומי לא-git שכבר לא בשימוש) והשורה המתאימה ב-`.gitignore`.
- `CLAUDE.md` עודכן בהתאם (סעיף "פריסה ל-production").

**מה עדיין נשאר לוודא:**
- ריצה ראשונה בפועל של ה-workflow (יקרה אוטומטית בפעם הבאה שקוד הרינדור ישתנה וימוזג ל-`main`) — עדיין לא נבדק end-to-end שהוא באמת עובד ב-GitHub Actions runner (רק שהיגיון ה-hash/הבדיקה תקין מקומית).
- טוקן ה-Fly ב-GitHub Actions secret הוא אותו טוקן ששימש כאן — כדאי לשקול טוקן פריסה מוגבל לאפליקציה אחת בלבד (`fly tokens create deploy -a photographer-flow-pdf-worker`) במקום טוקן חשבון מלא, לביטחון.
- לא נבדק אם `*.fly.dev` / `*.depot.dev` / `api.depot.dev` שנוספו לרשת של סביבת הענן עדיין נחוצים — הם לא עוזרים לפריסה בפועל (ראה למעלה), אפשר להסיר בבטחה אם רוצים לצמצם את הרשת. `api.machines.dev` כן שימושי (מאפשר `fly status`/Machines API).
- הטוקנים בסביבת הענן (`VERCEL_TOKEN`, `FLY_API_TOKEN`) שמורים עם עטיפת `< >` ורעש נוסף (`FLY_API_TOKEN=` בתוך הערך של עצמו) — עדיין לא תוקן בפועל בממשק ההגדרות, רק מנוקה בזיכרון בכל שיחה. לא חוסם, אבל שווה תיקון חד-פעמי.
