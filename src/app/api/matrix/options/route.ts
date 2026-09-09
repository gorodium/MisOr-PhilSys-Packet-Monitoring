import { NextResponse } from "next/server";
import { handleApiError, ok, fail } from "@/lib/api";

export async function GET() {
  try {
    const baseUrl = process.env.MATRIX_BASE_URL?.replace(/\/$/, "");
    const apiKey = process.env.MATRIX_API_KEY;
    const projectId = "philsys-it-support-ticketing-2026";

    if (!baseUrl || !apiKey) {
      return fail("Matrix API not configured", 500);
    }

    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Redmine-API-Key": apiKey
    };

    // Fetch all assignees
    const assigneesMap = new Map<number, { id: number, name: string }>();
    let offset = 0;
    const limit = 100;
    while (true) {
      const memUrl = `${baseUrl}/projects/${projectId}/memberships.json?limit=${limit}&offset=${offset}`;
      const memRes = await fetch(memUrl, { headers });
      if (!memRes.ok) break;
      const memData = await memRes.json();
      
      const pageAssignees = memData.memberships || [];
      for (const m of pageAssignees) {
        if (m.user && m.user.id && m.user.name) {
          assigneesMap.set(m.user.id, { id: m.user.id, name: m.user.name });
        }
      }
      
      if (pageAssignees.length < limit) break;
      offset += limit;
    }
    const assignees = Array.from(assigneesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Fetch all categories
    let categories: { id: number, name: string }[] = [];
    const catUrl = `${baseUrl}/projects/${projectId}/issue_categories.json`;
    const catRes = await fetch(catUrl, { headers });
    if (catRes.ok) {
      const catData = await catRes.json();
      categories = (catData.issue_categories || []).map((c: any) => ({ id: c.id, name: c.name })).sort((a: any, b: any) => a.name.localeCompare(b.name));
    }

    // Fetch all trackers
    let trackers: { id: number, name: string }[] = [];
    const trackerUrl = `${baseUrl}/trackers.json`;
    const trackerRes = await fetch(trackerUrl, { headers });
    if (trackerRes.ok) {
      const trackerData = await trackerRes.json();
      trackers = (trackerData.trackers || []).map((t: any) => ({ id: t.id, name: t.name }));
    }

    return ok({ assignees, categories, trackers });
  } catch (error) {
    return handleApiError(error);
  }
}
