import { RunStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, handleApiError, ok } from "@/lib/api";
import { getRequestActor, requireAdmin } from "@/lib/auth";
import { sanitizeSettingInput, getSettingsForUi, upsertSettings } from "@/lib/settings";
import { assertRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const settingsInputSchema = z.record(z.string(), z.unknown());

export async function GET(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "settings:get");
  if (limited) {
    return limited;
  }

  try {
    return ok({ settings: await getSettingsForUi() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  const forbidden = requireAdmin(request);
  if (forbidden) {
    return forbidden;
  }

  const limited = assertRateLimit(request, "settings:update");
  if (limited) {
    return limited;
  }

  const actor = getRequestActor(request);

  try {
    const body = settingsInputSchema.parse(await request.json());
    const settings = sanitizeSettingInput(body);
    await upsertSettings(settings);
    await writeAuditLog({
      action: "SETTINGS_UPDATE",
      actor,
      status: RunStatus.SUCCESS,
      message: "Settings were updated.",
      metadata: { keys: settings.map((setting) => setting.key) }
    });

    return ok({ settings: await getSettingsForUi() });
  } catch (error) {
    await writeAuditLog({
      action: "SETTINGS_UPDATE",
      actor,
      status: RunStatus.ERROR,
      message: error instanceof Error ? error.message : "Settings update failed."
    });
    return handleApiError(error);
  }
}

