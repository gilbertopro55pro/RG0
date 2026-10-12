import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEventWithSideEffects } from "@/lib/createEvent";
import type { PackageType } from "@/lib/stages";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const body = await request.json();
  const {
    clientName,
    eventType,
    clientPhone,
    pkg,
    customPackageId,
    eventDate,
    eventStartTime,
    eventEndTime,
    eventLocation,
    arrivalTime,
    notes,
    deposit,
    balance,
    paymentReminderDate,
    sourceGoogleCalendarEventId,
    allowCalendarConflict,
  }: {
    clientName: string;
    eventType?: string | null;
    clientPhone: string;
    pkg: PackageType | null;
    customPackageId: string | null;
    eventDate: string;
    eventStartTime: string | null;
    eventEndTime: string | null;
    eventLocation: string;
    arrivalTime: string;
    notes: string;
    deposit: number;
    balance: number;
    paymentReminderDate: string | null;
    sourceGoogleCalendarEventId?: string | null;
    // "יצירה בכל זאת" after a warning about a booking in the photographer's Google Calendar.
    allowCalendarConflict?: boolean;
  } = body;

  const result = await createEventWithSideEffects(supabase, {
    photographerId: user.id,
    clientName,
    eventType,
    clientPhone,
    pkg,
    customPackageId,
    eventDate,
    eventStartTime,
    eventEndTime,
    eventLocation,
    arrivalTime,
    notes,
    deposit,
    balance,
    paymentReminderDate,
    sourceGoogleCalendarEventId,
    checkCalendar: allowCalendarConflict !== true,
  });

  if (!result.ok) {
    // conflictSource/conflictWith let the form word the message in the photographer's language.
    return NextResponse.json(
      result.conflict
        ? { conflict: true, conflictSource: result.conflict.source, conflictWith: result.conflict.name, error: result.error }
        : { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    id: result.event.id,
    clientAccessToken: result.event.client_access_token,
    googleCalendarSynced: result.googleCalendarSynced,
  });
}
