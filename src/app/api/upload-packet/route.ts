import { NextRequest, NextResponse } from "next/server";
import { getStoredSettings } from "@/lib/settings";
import { NAS_DESTINATION_HOST } from "@/lib/nas-config";
import { uploadBufferToNas } from "@/lib/nas-client";
import { machineFolderForPacket } from "@/lib/packet-normalizer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const trnMatch = file.name.match(/^(\d{29})/);
    const trn = trnMatch ? trnMatch[1] : formData.get("trn")?.toString();

    if (!trn) {
      return NextResponse.json({ success: false, error: "Could not determine TRN from filename. Please ensure it starts with 29 digits." }, { status: 400 });
    }

    const proLpt = machineFolderForPacket(trn);
    if (!proLpt) {
      return NextResponse.json({ success: false, error: `Could not determine PRO-LPT for TRN: ${trn}` }, { status: 400 });
    }

    const stored = await getStoredSettings();
    const nasUsername = stored.get("nasUsername")?.value || process.env.NAS_USERNAME || "";
    const nas1Password = stored.get("nas1Password")?.value || process.env.NAS1_PASSWORD || "";
    const basePath = stored.get("nasUploadBasePath")?.value ?? "/Misamis Oriental";

    if (!nasUsername || !nas1Password) {
      return NextResponse.json({ success: false, error: "NAS credentials not configured." }, { status: 500 });
    }

    // Build destination path based on setting + PRO-LPT
    const baseFolder = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
    const destFolder = baseFolder ? `${baseFolder}/${proLpt}` : `/${proLpt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadBufferToNas(
      NAS_DESTINATION_HOST,
      nasUsername,
      nas1Password,
      buffer,
      destFolder,
      file.name
    );

    return NextResponse.json({ success: true, path: result.path });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
