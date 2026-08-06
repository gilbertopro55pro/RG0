import Link from "next/link";

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl p-6 text-center bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-2 font-display">התשלום התקבל 🎉</h1>
        <p className="text-sm text-ink-soft mb-5">
          אנחנו מעדכנים את החשבון שלך — זה עשוי לקחת כמה שניות. אפשר להמשיך לדאשבורד.
        </p>
        <Link href="/" className="block w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white">
          מעבר לדאשבורד
        </Link>
      </div>
    </div>
  );
}
