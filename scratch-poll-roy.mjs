import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const start = Date.now();
while (Date.now() - start < 5 * 60 * 1000) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 10, page: 1 });
  if (error) { console.log("query error:", error.message); }
  else {
    const u = data.users.find(u => u.email === "roygelbartphotography@gmail.com");
    if (u) {
      console.log("FOUND:", JSON.stringify({ id: u.id, confirmed: !!u.email_confirmed_at, created: u.created_at }));
      const { data: photographer } = await supabase.from("photographers").select("*").eq("id", u.id).maybeSingle();
      console.log("photographer row:", JSON.stringify(photographer));
      process.exit(0);
    }
  }
  await new Promise(r => setTimeout(r, 5000));
}
console.log("TIMEOUT - account never appeared within 5 minutes");
