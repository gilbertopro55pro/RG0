export function generateContractText({
  photographerName,
  photographerPhone,
  signature,
  clientName,
  clientPhone,
  eventDate,
  eventLocation,
  packageLabelText,
  depositAmount,
  balanceAmount,
  balanceDueDate,
}: {
  photographerName: string;
  photographerPhone: string;
  signature: string | null;
  clientName: string;
  clientPhone: string | null;
  eventDate: string;
  eventLocation: string | null;
  packageLabelText: string;
  depositAmount: number;
  balanceAmount: number;
  balanceDueDate: string | null;
}): string {
  const formattedDate = new Date(eventDate).toLocaleDateString("he-IL");
  const total = depositAmount + balanceAmount;
  const formattedDueDate = balanceDueDate ? new Date(balanceDueDate).toLocaleDateString("he-IL") : "מועד האירוע";

  return `הסכם הזמנת שירותי צילום

בין: ${photographerName} (${photographerPhone}) ("הצלם")
לבין: ${clientName}${clientPhone ? ` (${clientPhone})` : ""} ("הלקוח/ה")

1. פרטי האירוע
תאריך האירוע: ${formattedDate}
מיקום: ${eventLocation || "יעודכן"}
חבילה: ${packageLabelText}

2. תמורה ותשלומים
סכום כולל: ₪${total}
מקדמה: ₪${depositAmount} (לתשלום עם סגירת ההזמנה)
יתרה: ₪${balanceAmount} (לתשלום עד ${formattedDueDate})

3. תנאים כלליים
הצלם מתחייב לספק את שירותי הצילום כמפורט בחבילה שנבחרה, במועד ובמיקום שנקבעו לעיל.
ביטול ההזמנה על ידי הלקוח/ה בתוך פחות מ-30 יום ממועד האירוע עשוי לחייב את המקדמה כדמי ביטול.
כל שינוי בתנאי הסכם זה ייעשה בהסכמת שני הצדדים בכתב.

4. אישור וחתימה
בחתימתי (הקלדת שם מלא) להלן, אני מאשר/ת כי קראתי את תנאי ההסכם, אני מסכים/ה לתוכנו, וכי חתימה זו מהווה אישור אלקטרוני מחייב לפי חוק חתימה אלקטרונית, התשס"א-2001.

${signature ? `\n${signature}` : ""}`;
}
