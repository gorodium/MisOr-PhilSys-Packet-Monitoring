import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/auth";
import { writeActivity } from "@/lib/activity";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await verifySession();
    const actorName = session?.username || "System";

    const packetId = (await params).id;
    if (!packetId) {
      return NextResponse.json({ error: "Missing packet ID" }, { status: 400 });
    }

    const existingPacket = await prisma.packet.findUnique({
      where: { id: packetId },
      select: { matrixTags: true, normalizedPacketCode: true }
    });

    let newTags = existingPacket?.matrixTags || [];
    if (!newTags.includes("unrecoverable")) {
      newTags = [...newTags, "unrecoverable"];
    }

    await prisma.packet.update({
      where: { id: packetId },
      data: {
        matrixTags: newTags
      }
    });

    await writeActivity({
      type: "UNRECOVERABLE",
      actor: actorName,
      message: `${actorName} tagged packet ${existingPacket?.normalizedPacketCode} as Unrecoverable`,
      metadata: { packetCode: existingPacket?.normalizedPacketCode, packetId }
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
