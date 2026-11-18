import { NextRequest, NextResponse } from "next/server";
import { getStoredSettings } from "@/lib/settings";
import { NAS_DESTINATION_HOST } from "@/lib/nas-config";
import { uploadBufferToNas } from "@/lib/nas-client";
import { machineFolderForPacket, machineProvinceForPacket } from "@/lib/packet-normalizer";
import { prisma } from "@/lib/prisma";
import { syncTrnsWithBackendRestoration } from "@/app/api/upload-packet/sync-restoration/route";

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
    const province = machineProvinceForPacket(trn) || "Unknown";

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

    let uploadedPath = `${destFolder}/${file.name}`;
    let alreadyExists = false;

    try {
      const result = await uploadBufferToNas(
        NAS_DESTINATION_HOST,
        nasUsername,
        nas1Password,
        buffer,
        destFolder,
        file.name
      );
      uploadedPath = result.path || uploadedPath;
    } catch (uploadErr: any) {
      if (uploadErr?.message === "Packet already uploaded") {
        alreadyExists = true;
      } else {
        throw uploadErr;
      }
    }

    const existingRecord = await prisma.uploadedPacket.findFirst({
      where: { trn }
    });
    if (!existingRecord) {
      await prisma.uploadedPacket.create({
        data: {
          trn,
          filename: file.name,
          nasPath: uploadedPath,
          province
        }
      });
    }

    if (!alreadyExists) {
      const { verifySession } = await import("@/lib/auth");
      const session = await verifySession();
      const { writeActivity } = await import("@/lib/activity");
      await writeActivity({
        type: "MANUAL_UPLOAD",
        actor: session?.username || "System",
        message: `${session?.username || "System"} manually uploaded packet ${file.name} to NAS`,
        metadata: { trn, filename: file.name, province }
      });
    }

    const syncResult = await syncTrnsWithBackendRestoration([trn]);

    return NextResponse.json({
      success: true,
      alreadyExists,
      path: uploadedPath,
      matchedRestorationPackets: syncResult.matchedPackets
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
