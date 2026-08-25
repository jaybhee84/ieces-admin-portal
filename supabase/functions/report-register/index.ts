import { createClient } from "@supabase/supabase-js";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { email, password, username, family_name, first_name, middle_initial } =
    (await request.json()) as {
      email?: string;
      password?: string;
      username?: string;
      family_name?: string;
      first_name?: string;
      middle_initial?: string | null;
    };

  if (!email || !password || !username) {
    return json(400, { error: "Email, password, and username are required." });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Whitelist check against report_allowed_users
  const { data: allowed } = await supabaseAdmin
    .from("report_allowed_users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!allowed) {
    return json(403, {
      error:
        "This email is not approved for registration. Contact your administrator.",
    });
  }

  // 2. Prevent duplicate profile (username taken)
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("username", username.trim())
    .maybeSingle();

  if (existingProfile) {
    return json(409, { error: "Username is already taken." });
  }

  // 3. Check if email already exists in auth.users (shared with another app)
  const { data: listData, error: listErr } =
    await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });

  if (listErr) {
    return json(500, { error: "Could not verify user registry." });
  }

  const existingAuthUser = listData.users.find(
    (u: { email?: string }) => u.email === normalizedEmail,
  );

  let authUserId: string;

  if (existingAuthUser) {
    // Email already in Auth (e.g. registered in BMI, Dashboard Manager, etc.)
    // Reuse the same auth.users record — no "email exists" error.
    authUserId = existingAuthUser.id as string;
  } else {
    // Brand-new email — create the auth user.
    const { data: newUser, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
      });

    if (createErr) {
      return json(400, { error: createErr.message });
    }
    authUserId = newUser.user!.id;
  }

  // 4. Insert per-app profile into profiles table
  const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
    id: authUserId,
    email: normalizedEmail,
    username: username.trim(),
    family_name: family_name?.trim() || "",
    first_name: first_name?.trim() || "",
    middle_initial: middle_initial?.trim() || null,
    app_source: "report",
  });

  if (profileErr) {
    return json(500, { error: profileErr.message });
  }

  return json(200, { success: true });
});
