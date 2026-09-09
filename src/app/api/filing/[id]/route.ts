import { NextRequest } from "next/server";
import { handleApiError, ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const existingReq = await prisma.matrixFilingRequest.findUnique({
      where: { id }
    });

    if (!existingReq) {
      return fail("Filing request not found", 404);
    }

    await prisma.matrixFilingRequest.delete({
      where: { id }
    });

    return ok({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
