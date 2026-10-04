import { cookies } from "next/headers";
import { LANG_COOKIE, isLang, type Lang } from "@/i18n/config";
import { messagesFor } from "@/i18n/dict";
import { makeT, type TFn } from "@/i18n/translate";

// Server components and route handlers: the current UI language and a t() for it.
export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "he";
}

export async function getT(): Promise<TFn> {
  return makeT(messagesFor(await getLang()));
}
