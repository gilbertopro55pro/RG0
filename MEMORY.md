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

## 2026-09-23 — פורטפוליו: תיקוני העלאה/שיתוף, עיצוב מחדש, וניקוי חוב עיצובי

- PR #16: העלאה ישירה לפורטפוליו (ניסיונות חוזרים + שגיאות אמיתיות), בחירת לשונית כרשימה נפתחת + "לשונית חדשה", שיתוף לפי לשוניות (`?tabs=` — נאכף בשרת), הסבר לשדה "טקסט פתיחה".
- עיצוב מחדש של `/p/[slug]`: כהה/אדיטוריאלי, hero מתחלף אוטומטית (`PortfolioHeroCarousel.tsx`), לשוניות כאריחי תמונה, ביו כרצועה כהה, אקסנט brass.
- באג שהיה חי: `/p` חסר ב-HIDDEN_PREFIXES של `TopNav.tsx` ו-`InstallPrompt.tsx` — לקוחות ראו את סרגל הניווט של האפליקציה + "התקינו את האפליקציה" בפורטפוליו. תוקן.
- תנועה: easing הלחיצה הגלובלי (globals.css) הוחלף מ-bounce ל-expo-out; blur של `.bg-card` 32px→20px. אייקונים: כל 36 ה-"✕" הגולמיים → `IconClose`; חיצים גולמיים → `IconArrow*` ב-NavIcons.tsx.
- **בדיקה חזותית**: preview deployments של Vercel מחזירים 500 — משתני Supabase/R2 מוגדרים רק ל-Production. הדרך שעובדת: `vercel deploy --prod --skip-domain` (משתני production בלי לגעת ב-myframeflow.com) + Playwright עם `x-vercel-protection-bypass` (מ-`protectionBypass` בפרויקט, לא להדפיס). `cdn.myframeflow.com`/R2 חסומים ברשת הסביבה — להחליף תמונות ב-stub בדפדפן הבדיקה; לנתב בקשות vercel.app דרך `route.fetch` עם retries (Chromium מקבל ERR_TOO_MANY_RETRIES דרך ה-proxy).
- פתוח (לא בוצע בכוונה): איחוד סקאלת radius בכל האפליקציה, החלפת צבע ה-CTA הראשי ל-brass בכל האפליקציה, skeleton/count-up. בנוסף: עמוד פורטפוליו עם אלפי תמונות ("הכל" של gilberto = 2,471) חותם URL לכולן בכל ביקור ומרנדר עמוד ענק — כדאי pagination/טעינה הדרגתית.

## 2026-09-23 (המשך) — רצועה ראשית לפי כוכבים + טעינה הדרגתית בפורטפוליו

- Migration 0125 (רץ על ה-DB החי): `gallery_photos.portfolio_featured` + trigger `enforce_portfolio_featured` — מקסימום 25 לצלם (עם advisory lock נגד לחיצות מקבילות), ומנקה את הכוכב כשתמונה יוצאת מהפורטפוליו. נבדק בפועל ב-DO block שעושה rollback (25 עברו, ה-26 נחסמה, ניקוי בהסרה עבד).
- `/p/[slug]`: הרצועה מציגה רק תמונות עם כוכב (בתוך ה-`tabs` של הקישור); אין כוכבים → אין רצועה. ה-grid נטען 48 בכל פעם (`PortfolioGrid.tsx`, עמודות מפורשות כדי שתמונות לא יקפצו) דרך API ציבורי `/api/portfolio/[slug]/photos` — נוסף ל-PUBLIC_PATHS ב-`src/lib/supabase/middleware.ts` (בלי זה מבקרים לא מחוברים מופנים ל-login). הלוגיקה המשותפת עמוד/API ב-`src/lib/portfolio.ts` — כדי שה-API לא יעקוף את הגבלת `tabs` (נבדק: tabs=A+category=B מחזיר 0).
- הגדרות: `PortfolioFeaturedPicker.tsx` — כוכב על כל תמונה, סינון לפי לשונית, מונה X/25. לא נבדק בדפדפן (דורש התחברות לחשבון המשתמש).
- תוקן: `PortfolioManagePanel` ספר תמונות עם select אחד (תקרת 1,000 שורות) — ספירות שגויות לפורטפוליו גדול; עכשיו fetchAllRows.
