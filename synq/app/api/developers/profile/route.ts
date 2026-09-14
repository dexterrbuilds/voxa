import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonError,
  registryStorageError,
} from "@/lib/server/agents/registration";
import {
  defaultDisplayNameForUser,
  mapEditableDeveloperProfile,
  parseDeveloperProfileBody,
  suggestedUsernameForUser,
  type DeveloperProfileRecord,
} from "@/lib/server/developers/profile";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const { data, error } = await auth.supabase
    .from("developer_profiles")
    .select(
      "user_id, username, display_name, bio, avatar_url, website, x_handle, joined_at, updated_at",
    )
    .eq("user_id", auth.user.id)
    .maybeSingle<DeveloperProfileRecord>();

  if (error) {
    return registryStorageError(error);
  }

  return NextResponse.json({
    profile: data ? mapEditableDeveloperProfile(data) : null,
    suggestedProfile: {
      avatarUrl: "",
      bio: "",
      displayName: defaultDisplayNameForUser(auth.user),
      username: suggestedUsernameForUser(auth.user),
      website: "",
      xHandle: "",
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400, "invalid_json");
  }

  let parsed;
  try {
    parsed = parseDeveloperProfileBody(body);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid developer profile request.",
      400,
      "invalid_developer_profile",
    );
  }

  const { data, error } = await auth.supabase
    .from("developer_profiles")
    .upsert(
      {
        ...parsed,
        user_id: auth.user.id,
      },
      { onConflict: "user_id" },
    )
    .select(
      "user_id, username, display_name, bio, avatar_url, website, x_handle, joined_at, updated_at",
    )
    .single<DeveloperProfileRecord>();

  if (error) {
    if (error.code === "23505") {
      return jsonError("That username is already taken.", 409, "username_taken");
    }
    return registryStorageError(error);
  }

  return NextResponse.json({ profile: mapEditableDeveloperProfile(data) });
}
