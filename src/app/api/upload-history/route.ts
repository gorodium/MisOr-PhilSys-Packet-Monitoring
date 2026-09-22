import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const history = await prisma.uploadedPacket.findMany({
      orderBy: { createdAt: "desc" }
    });

    // Calculate KPIs by Province
    const kpiByProvince: Record<string, number> = {};
    for (const record of history) {
      if (!kpiByProvince[record.province]) {
        kpiByProvince[record.province] = 0;
      }
      kpiByProvince[record.province]++;
    }

    const kpiCards = Object.entries(kpiByProvince).map(([province, count]) => ({
      province,
      count
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, history, kpiCards });
  } catch (error: any) {
    console.error("Upload history error:", error);
    return NextResponse.json({ success: false, error: error.message || "Internal server error" }, { status: 500 });
  }
}
