import { AppSetting } from "@prisma/client";
import { DEFAULT_TICKET_TEMPLATE } from "@/lib/constants";
import { readBooleanEnv, readEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type SettingDefinition = {
  key: string;
  label: string;
  envName: string;
  fallback: string;
  type: "text" | "number" | "boolean" | "textarea" | "select";
  required?: boolean;
  isSecret?: boolean;
  options?: string[];
};

export const settingDefinitions: SettingDefinition[] = [
  {
    key: "googleSpreadsheetId",
    label: "Google Spreadsheet ID",
    envName: "GOOGLE_SPREADSHEET_ID",
    fallback: "",
    type: "text"
  },
  {
    key: "googleSheetName",
    label: "Sheet name",
    envName: "GOOGLE_SHEET_NAME",
    fallback: "Packets",
    type: "text",
    required: true
  },
  {
    key: "packetColumnName",
    label: "Packet column name",
    envName: "GOOGLE_PACKET_COLUMN_NAME",
    fallback: "Packet",
    type: "text",
    required: true
  },
  {
    key: "issueCategoryColumnName",
    label: "Issue category/status column name",
    envName: "GOOGLE_ISSUE_CATEGORY_COLUMN_NAME",
    fallback: "Issue Category",
    type: "text"
  },
  {
    key: "outputFiledStatusColumn",
    label: "Output column for filed status",
    envName: "GOOGLE_OUTPUT_FILED_STATUS_COLUMN",
    fallback: "Filed Status",
    type: "text"
  },
  {
    key: "outputTicketNumberColumn",
    label: "Output column for ticket number",
    envName: "GOOGLE_OUTPUT_TICKET_NUMBER_COLUMN",
    fallback: "Ticket Number",
    type: "text"
  },
  {
    key: "outputRemarksColumn",
    label: "Output column for remarks",
    envName: "GOOGLE_OUTPUT_REMARKS_COLUMN",
    fallback: "Remarks",
    type: "text"
  },
  {
    key: "outputLastUpdatedColumn",
    label: "Output column for last updated",
    envName: "GOOGLE_OUTPUT_LAST_UPDATED_COLUMN",
    fallback: "Last Updated",
    type: "text"
  },
  {
    key: "matrixBaseUrl",
    label: "Matrix base URL",
    envName: "MATRIX_BASE_URL",
    fallback: "",
    type: "text"
  },
  {
    key: "matrixMode",
    label: "Matrix API mode",
    envName: "MATRIX_MODE",
    fallback: "demo",
    type: "select",
    options: ["demo", "http", "browser"]
  },
  {
    key: "matrixApiKey",
    label: "Matrix API key (Redmine)",
    envName: "MATRIX_API_KEY",
    fallback: "",
    type: "text",
    isSecret: true
  },
  {
    key: "matrixProjectId",
    label: "Matrix project ID",
    envName: "MATRIX_PROJECT_ID",
    fallback: "philsys-it-support-ticketing-2026",
    type: "text",
    required: true
  },
  {
    key: "nasUsername",
    label: "NAS Username (for both NAS)",
    envName: "NAS_USERNAME",
    fallback: "",
    type: "text"
  },
  {
    key: "nas1Password",
    label: "NAS 1 Password (upload.philsys.gov.ph)",
    envName: "NAS1_PASSWORD",
    fallback: "",
    type: "text",
    isSecret: true
  },
  {
    key: "nas2Password",
    label: "NAS 2 Password (upload2.philsys.gov.ph)",
    envName: "NAS2_PASSWORD",
    fallback: "",
    type: "text",
    isSecret: true
  },
  {
    key: "syncIntervalSeconds",
    label: "Sync interval",
    envName: "SYNC_INTERVAL_SECONDS",
    fallback: "300",
    type: "number"
  },
  {
    key: "autoTicketCreationEnabled",
    label: "Auto ticket creation",
    envName: "AUTO_TICKET_CREATION_ENABLED",
    fallback: "false",
    type: "boolean"
  },
  {
    key: "ticketBodyTemplate",
    label: "Ticket body template",
    envName: "TICKET_BODY_TEMPLATE",
    fallback: DEFAULT_TICKET_TEMPLATE,
    type: "textarea",
    required: true
  },
  {
    key: "backendRestorationCommentTemplate",
    label: "Backend Restoration Comment Template",
    envName: "BACKEND_RESTORATION_COMMENT_TEMPLATE",
    fallback: "{{packetCode}}\n\nPacket has been uploaded to\n\n{{destFolder}}/",
    type: "textarea"
  }
];

export type ResolvedSettings = {
  googleSpreadsheetId: string;
  googleSheetName: string;
  packetColumnName: string;
  issueCategoryColumnName: string;
  outputFiledStatusColumn: string;
  outputTicketNumberColumn: string;
  outputRemarksColumn: string;
  outputLastUpdatedColumn: string;
  matrixBaseUrl: string;
  matrixMode: "demo" | "http" | "browser";
  syncIntervalSeconds: number;
  autoTicketCreationEnabled: boolean;
  ticketBodyTemplate: string;
  backendRestorationCommentTemplate: string;
};

function settingValueFromEnv(definition: SettingDefinition) {
  return readEnv(definition.envName, definition.fallback);
}

function coerceSettingValue(definition: SettingDefinition, raw: string) {
  if (definition.type === "boolean") {
    return readBooleanLike(raw) ? "true" : "false";
  }

  if (definition.type === "number") {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? String(Math.floor(value)) : definition.fallback;
  }

  if (definition.type === "select" && definition.options?.length) {
    return definition.options.includes(raw) ? raw : definition.fallback;
  }

  return raw;
}

function readBooleanLike(value: string) {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function sanitizeSettingInput(input: Record<string, unknown>) {
  const sanitized: Array<{ key: string; value: string; isSecret: boolean }> = [];

  for (const definition of settingDefinitions) {
    // If it's a secret and the user didn't provide a new value (it's empty), skip updating it.
    if (!(definition.key in input) || (definition.isSecret && !input[definition.key])) {
      continue;
    }

    const raw = input[definition.key];
    const value = typeof raw === "string" ? raw : String(raw ?? "");
    sanitized.push({
      key: definition.key,
      value: coerceSettingValue(definition, value),
      isSecret: Boolean(definition.isSecret)
    });
  }

  return sanitized;
}

export async function getStoredSettings() {
  const settings = await prisma.appSetting.findMany();
  return new Map(settings.map((setting) => [setting.key, setting]));
}

export async function getSettingsForUi() {
  const stored = await getStoredSettings();

  return settingDefinitions.map((definition) => {
    const storedSetting = stored.get(definition.key);
    const envValue = settingValueFromEnv(definition);
    const value = storedSetting?.value ?? envValue;

    return {
      ...definition,
      value: definition.isSecret && value ? "" : value,
      configured: Boolean(value)
    };
  });
}

export async function upsertSettings(settings: Array<{ key: string; value: string; isSecret?: boolean }>) {
  await prisma.$transaction(
    settings.map((setting) =>
      prisma.appSetting.upsert({
        where: { key: setting.key },
        create: {
          key: setting.key,
          value: setting.value,
          isSecret: Boolean(setting.isSecret)
        },
        update: {
          value: setting.value,
          isSecret: Boolean(setting.isSecret)
        }
      })
    )
  );
}

export async function getResolvedSettings(): Promise<ResolvedSettings> {
  const stored = await getStoredSettings();
  const value = (key: keyof ResolvedSettings) => {
    const definition = settingDefinitions.find((item) => item.key === key);
    if (!definition) {
      throw new Error(`Unknown setting: ${String(key)}`);
    }

    return stored.get(definition.key)?.value ?? settingValueFromEnv(definition);
  };

  const matrixMode = value("matrixMode");
  const syncIntervalSeconds = Number(value("syncIntervalSeconds"));

  return {
    googleSpreadsheetId: value("googleSpreadsheetId"),
    googleSheetName: value("googleSheetName"),
    packetColumnName: value("packetColumnName"),
    issueCategoryColumnName: value("issueCategoryColumnName"),
    outputFiledStatusColumn: value("outputFiledStatusColumn"),
    outputTicketNumberColumn: value("outputTicketNumberColumn"),
    outputRemarksColumn: value("outputRemarksColumn"),
    outputLastUpdatedColumn: value("outputLastUpdatedColumn"),
    matrixBaseUrl: value("matrixBaseUrl"),
    matrixMode: matrixMode === "http" || matrixMode === "browser" ? matrixMode : "demo",
    syncIntervalSeconds:
      Number.isFinite(syncIntervalSeconds) && syncIntervalSeconds > 0 ? Math.floor(syncIntervalSeconds) : 300,
    autoTicketCreationEnabled: readBooleanLike(value("autoTicketCreationEnabled")),
    ticketBodyTemplate: value("ticketBodyTemplate") || DEFAULT_TICKET_TEMPLATE,
    backendRestorationCommentTemplate: value("backendRestorationCommentTemplate") || "{{packetCode}}\n\nPacket has been uploaded to\n\n{{destFolder}}/"
  };
}

export function redactSetting(setting: AppSetting) {
  return {
    ...setting,
    value: setting.isSecret ? "" : setting.value,
    configured: Boolean(setting.value)
  };
}
