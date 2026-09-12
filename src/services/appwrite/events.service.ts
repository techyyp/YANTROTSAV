import { ID, Query, Permission, Role } from "appwrite";
import { databases } from "./client";
import { APPWRITE_CONFIG } from "../../config/appwrite.config";
import { mapAppwriteError, AppError } from "./errorMapper";
import { storageService } from "./storage.service";
import { addStoredDeletedReg, addStoredDeletedTeam } from "./admin.service";
import type {
  EventDocument,
  CreateEventDTO,
  UpdateEventDTO,
  EventStatus,
} from "../../types/database.types";
import {
  getEventSlotLimit,
  isEventDeadlinePassed,
  isTeamEvent,
} from "../../utils/eventCapacity";

// Only valid attributes in the Appwrite `events` collection schema:
// title, category, description, eventType, minTeamSize, maxTeamSize,
// maxTeamsAllowed, registrationDeadline, status, bannerUrl, venue

export class EventsService {
  /** Fetch all events from DB, optionally filtered by category / status */
  async getEvents(options?: {
    category?: string;
    status?: EventStatus;
    limit?: number;
  }): Promise<EventDocument[]> {
    const queries = [
      Query.limit(options?.limit ?? 100),
      Query.orderDesc("$createdAt"),
    ];
    if (options?.category && options?.category !== "all") {
      // Server-side filtering using Appwrite index on 'category'
      queries.unshift(Query.equal("category", options.category.toLowerCase()));
    }
    const response = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.events,
      queries,
    );

    let docs = response.documents as unknown as EventDocument[];
    // Mark status as closed for all events site-wide
    docs = docs.map((e) => ({ ...e, status: "closed" as EventStatus }));
    if (options?.status) {
      docs = docs.filter((e) => e.status === options.status);
    }

    return this.hydrateOccupancy(docs);
  }

  /** Fetch a single event by its Appwrite document ID */
  async getEventById(eventId: string): Promise<EventDocument> {
    const doc = await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.events,
      eventId,
    );
    const event = doc as unknown as EventDocument;
    event.status = "closed" as EventStatus;
    event.currentRegistrations = await this.countEventOccupancy(event);
    return event;
  }

  /**
   * Create a new event (Admin only).
   * Only sends attributes that exist in the Appwrite schema.
   */
  async createEvent(data: CreateEventDTO): Promise<EventDocument> {
    if (!data.title?.trim())
      throw new AppError("Event title is required.", "UNKNOWN_ERROR", 400);
    if (!data.description?.trim())
      throw new AppError(
        "Event description is required.",
        "UNKNOWN_ERROR",
        400,
      );
    if (!data.bannerUrl?.trim())
      throw new AppError(
        "Event banner image is required.",
        "UNKNOWN_ERROR",
        400,
      );

    const eventType = (data.eventType || data.format || "team") as
      | "solo"
      | "team";
    const isSolo = eventType === "solo";

    // Build payload with ONLY the exact schema attributes
    const payload: Record<string, unknown> = {
      title: data.title.trim(),
      category: (data.category || "other").trim().toLowerCase(),
      description: data.description.trim(),
      bannerUrl: data.bannerUrl.trim(),
      eventType,
      minTeamSize: isSolo ? 1 : Math.max(1, Number(data.minTeamSize) || 2),
      maxTeamSize: isSolo ? 1 : Math.max(1, Number(data.maxTeamSize) || 4),
      maxTeamsAllowed: Number(data.maxTeamsAllowed || data.maxTeams) || 50,
      status: data.status || "published",
    };

    // Optional: venue
    if (data.venue?.trim()) payload.venue = data.venue.trim();

    // Optional: eventTiming — ISO datetime or formatted date
    if (data.eventTiming?.trim() || data.eventDate?.trim()) {
      const timeVal = (data.eventTiming || data.eventDate || "").trim();
      const parsed = new Date(timeVal);
      payload.eventTiming = !isNaN(parsed.getTime())
        ? parsed.toISOString()
        : timeVal;
    }

    // Optional: registrationDeadline — MUST be a valid ISO datetime
    if (data.registrationDeadline?.trim()) {
      const parsed = new Date(data.registrationDeadline.trim());
      if (!isNaN(parsed.getTime())) {
        payload.registrationDeadline = parsed.toISOString();
      }
    }

    try {
      let doc: any;
      try {
        doc = await databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.events,
          ID.unique(),
          payload,
          [
            Permission.read(Role.any()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
          ],
        );
      } catch (permErr: any) {
        console.warn(
          "[EventsService] createDocument with permissions failed, retrying with collection default permissions:",
          permErr?.message,
        );
        // Fallback: inherit collection-level permissions
        doc = await databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.events,
          ID.unique(),
          payload,
        );
      }
      return doc as unknown as EventDocument;
    } catch (error) {
      throw mapAppwriteError(error, "EventsService.createEvent");
    }
  }

  /**
   * Update an existing event (Admin only).
   * Sends only the fields that are provided.
   */
  async updateEvent(
    eventId: string,
    data: UpdateEventDTO,
  ): Promise<EventDocument> {
    const payload: Record<string, unknown> = {};

    if (data.title !== undefined) payload.title = data.title.trim();
    if (data.category !== undefined)
      payload.category = data.category.trim().toLowerCase();
    if (data.description !== undefined)
      payload.description = data.description.trim();
    if (data.status !== undefined) payload.status = data.status;

    if (data.eventType !== undefined || data.format !== undefined) {
      payload.eventType = data.eventType || data.format;
    }
    if (data.minTeamSize !== undefined)
      payload.minTeamSize = Number(data.minTeamSize);
    if (data.maxTeamSize !== undefined)
      payload.maxTeamSize = Number(data.maxTeamSize);
    if (data.maxTeamsAllowed !== undefined || data.maxTeams !== undefined) {
      payload.maxTeamsAllowed = Number(data.maxTeamsAllowed || data.maxTeams);
    }
    if (data.venue !== undefined) {
      payload.venue = data.venue?.trim() || null;
    }
    if (data.bannerUrl !== undefined) {
      if (!data.bannerUrl?.trim()) {
        throw new AppError(
          "Event banner image is required and cannot be empty.",
          "UNKNOWN_ERROR",
          400,
        );
      }
      payload.bannerUrl = data.bannerUrl.trim();
    }
    if (data.eventTiming !== undefined || data.eventDate !== undefined) {
      const timeVal = (data.eventTiming || data.eventDate || "").trim();
      if (timeVal) {
        const parsed = new Date(timeVal);
        payload.eventTiming = !isNaN(parsed.getTime())
          ? parsed.toISOString()
          : timeVal;
      } else {
        payload.eventTiming = null;
      }
    }
    if (data.registrationDeadline !== undefined) {
      if (data.registrationDeadline?.trim()) {
        const parsed = new Date(data.registrationDeadline.trim());
        payload.registrationDeadline = !isNaN(parsed.getTime())
          ? parsed.toISOString()
          : null;
      } else {
        payload.registrationDeadline = null;
      }
    }

    try {
      const doc = await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.events,
        eventId,
        payload,
      );
      return doc as unknown as EventDocument;
    } catch (error) {
      throw mapAppwriteError(error, "EventsService.updateEvent");
    }
  }

  /**
   * Permanently delete an event by ID, cascade-deleting all associated records:
   * 1. event_registrations (all enrolled students)
   * 2. team_invitations (all pending/accepted invites)
   * 3. teams (all formed teams for this event)
   * 4. uploaded storage banner asset
   * 5. the event document itself
   */
  async deleteEvent(eventId: string, knownBannerUrl?: string): Promise<void> {
    try {
      // 1. Fetch event metadata to locate storage banner if not directly provided
      let eventDoc: EventDocument | null = null;
      if (!knownBannerUrl) {
        try {
          eventDoc = await this.getEventById(eventId);
        } catch (err) {
          console.warn(
            `[EventsService] Could not fetch event ${eventId} metadata:`,
            err,
          );
        }
      }

      // 2. Cascade delete all event_registrations for this event
      try {
        let hasMoreRegs = true;
        while (hasMoreRegs) {
          const regsRes = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            [Query.equal("eventId", eventId), Query.limit(100)],
          );
          if (regsRes.documents.length === 0) {
            hasMoreRegs = false;
            break;
          }
          await Promise.all(
            regsRes.documents.map(async (doc) => {
              addStoredDeletedReg(doc.$id);
              try {
                await databases.deleteDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.eventRegistrations,
                  doc.$id,
                );
              } catch {
                try {
                  await databases.updateDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.eventRegistrations,
                    doc.$id,
                    {},
                    [
                      Permission.read(Role.any()),
                      Permission.update(Role.any()),
                      Permission.delete(Role.any()),
                    ],
                  );
                  await databases.deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.eventRegistrations,
                    doc.$id,
                  );
                } catch (err) {
                  console.warn(`Error deleting registration ${doc.$id}:`, err);
                }
              }
            }),
          );
          if (regsRes.documents.length < 100) {
            hasMoreRegs = false;
          }
        }
      } catch (regsErr) {
        console.warn("Error during registrations cascade deletion:", regsErr);
      }

      // 3. Cascade delete all team_invitations for this event
      try {
        let hasMoreInvites = true;
        while (hasMoreInvites) {
          const invitesRes = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teamInvitations,
            [Query.equal("eventId", eventId), Query.limit(100)],
          );
          if (invitesRes.documents.length === 0) {
            hasMoreInvites = false;
            break;
          }
          await Promise.all(
            invitesRes.documents.map(async (doc) => {
              try {
                await databases.deleteDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teamInvitations,
                  doc.$id,
                );
              } catch {
                try {
                  await databases.updateDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.teamInvitations,
                    doc.$id,
                    {},
                    [
                      Permission.read(Role.any()),
                      Permission.update(Role.any()),
                      Permission.delete(Role.any()),
                    ],
                  );
                  await databases.deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.teamInvitations,
                    doc.$id,
                  );
                } catch (err) {
                  console.warn(`Error deleting invitation ${doc.$id}:`, err);
                }
              }
            }),
          );
          if (invitesRes.documents.length < 100) {
            hasMoreInvites = false;
          }
        }
      } catch (invErr) {
        console.warn("Error during invitations cascade deletion:", invErr);
      }

      // 4. Cascade delete all teams for this event
      try {
        let hasMoreTeams = true;
        while (hasMoreTeams) {
          const teamsRes = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teams,
            [Query.equal("eventId", eventId), Query.limit(100)],
          );
          if (teamsRes.documents.length === 0) {
            hasMoreTeams = false;
            break;
          }
          await Promise.all(
            teamsRes.documents.map(async (tDoc) => {
              addStoredDeletedTeam(tDoc.$id);
              // Delete any lingering invitations by teamId
              try {
                const lingering = await databases.listDocuments(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teamInvitations,
                  [Query.equal("teamId", tDoc.$id), Query.limit(100)],
                );
                for (const li of lingering.documents) {
                  await databases
                    .deleteDocument(
                      APPWRITE_CONFIG.databaseId,
                      APPWRITE_CONFIG.collections.teamInvitations,
                      li.$id,
                    )
                    .catch(() => {});
                }
              } catch {
                // ignore
              }

              try {
                await databases.deleteDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teams,
                  tDoc.$id,
                );
              } catch {
                try {
                  await databases.updateDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.teams,
                    tDoc.$id,
                    {},
                    [
                      Permission.read(Role.any()),
                      Permission.update(Role.any()),
                      Permission.delete(Role.any()),
                    ],
                  );
                  await databases.deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.teams,
                    tDoc.$id,
                  );
                } catch {
                  await databases
                    .updateDocument(
                      APPWRITE_CONFIG.databaseId,
                      APPWRITE_CONFIG.collections.teams,
                      tDoc.$id,
                      { status: "cancelled" },
                    )
                    .catch(() => {});
                }
              }
            }),
          );
          if (teamsRes.documents.length < 100) {
            hasMoreTeams = false;
          }
        }
      } catch (teamsErr) {
        console.warn("Error during teams cascade deletion:", teamsErr);
      }

      // 5. Delete banner file from Storage bucket if exists
      const targetBanner = knownBannerUrl || eventDoc?.bannerUrl;
      if (targetBanner) {
        try {
          console.log(
            `[EventsService] Deleting event banner for event ${eventId}:`,
            targetBanner,
          );
          const deleted =
            await storageService.deleteEventBannerFromUrl(targetBanner);
          if (deleted) {
            console.log(
              `[EventsService] ✅ Successfully deleted banner file for event ${eventId}`,
            );
          } else {
            console.warn(
              `[EventsService] ⚠️ Banner file could not be deleted for event ${eventId} (may not exist or permission denied)`,
            );
          }
        } catch (storageErr) {
          console.warn(
            "[EventsService] Error deleting event banner asset:",
            storageErr,
          );
        }
      }

      // 6. Delete the event document itself
      await databases.deleteDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.events,
        eventId,
      );
    } catch (error) {
      throw mapAppwriteError(error, "EventsService.deleteEvent");
    }
  }

  /** Toggle an event between published and closed */
  async toggleRegistration(
    eventId: string,
    isOpen: boolean,
  ): Promise<EventDocument> {
    return this.updateEvent(eventId, {
      status: isOpen ? "published" : "closed",
    });
  }

  /**
   * Block new enrollments when the event is closed, past deadline, or at max slots.
   * Must run before creating a registration or team.
   */
  async assertHasCapacity(_event: EventDocument): Promise<void> {
    throw new AppError(
      "Registrations for Yantrotsav 2026 events are now officially closed.",
      "EVENT_REGISTRATION_CLOSED",
      400,
    );
  }

  /** Recount live occupancy after a successful enroll/cancel and auto-close when full. */
  async syncOccupancy(eventId: string): Promise<void> {
    const event = (await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.events,
      eventId,
    )) as unknown as EventDocument;
    const occupancy = await this.countEventOccupancy(event);
    event.currentRegistrations = occupancy;
    const maxAllowed = getEventSlotLimit(event);
    if (
      isEventDeadlinePassed(event) ||
      (maxAllowed && occupancy >= maxAllowed)
    ) {
      await this.closeEventIfWindowEnded(event, true);
      return;
    }
    await this.persistOccupancy(
      eventId,
      occupancy,
      maxAllowed,
      event.status === "published",
    );
  }

  async incrementRegistrations(eventId: string): Promise<void> {
    await this.syncOccupancy(eventId);
  }

  async checkCapacity(eventId: string): Promise<void> {
    const event = await this.getEventById(eventId);
    await this.assertHasCapacity(event);
  }

  /** Persist closed status for events that are past deadline or at capacity. */
  async enforceRegistrationWindows(events: EventDocument[]): Promise<void> {
    await Promise.all(
      events.map((event) => this.closeEventIfWindowEnded(event, false)),
    );
  }

  private async hydrateOccupancy(
    events: EventDocument[],
  ): Promise<EventDocument[]> {
    if (!events.length) return events;

    const [teamsRes, regsRes] = await Promise.all([
      databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          [Query.limit(500)],
        )
        .catch(() => ({ documents: [] as any[] })),
      databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.limit(500)],
        )
        .catch(() => ({ documents: [] as any[] })),
    ]);

    const activeTeamsByEvent = new Map<string, number>();
    for (const team of teamsRes.documents as any[]) {
      const status = String(team.status || "");
      if (
        status === "cancelled" ||
        status === "disbanded" ||
        status === "disqualified"
      )
        continue;
      const eventId = String(team.eventId || "");
      if (!eventId) continue;
      activeTeamsByEvent.set(
        eventId,
        (activeTeamsByEvent.get(eventId) || 0) + 1,
      );
    }

    const teamsByEventFromRegs = new Map<string, Set<string>>();
    const regsByEvent = new Map<string, number>();
    for (const reg of regsRes.documents as any[]) {
      const eventId = String(reg.eventId || "");
      if (!eventId) continue;
      regsByEvent.set(eventId, (regsByEvent.get(eventId) || 0) + 1);
      if (reg.teamId) {
        if (!teamsByEventFromRegs.has(eventId)) {
          teamsByEventFromRegs.set(eventId, new Set());
        }
        teamsByEventFromRegs.get(eventId)!.add(String(reg.teamId));
      }
    }

    for (const event of events) {
      const teamsCountFromTeams = activeTeamsByEvent.get(event.$id) || 0;
      const teamsCountFromRegs = teamsByEventFromRegs.get(event.$id)?.size || 0;
      const occupancy = isTeamEvent(event)
        ? Math.max(teamsCountFromTeams, teamsCountFromRegs)
        : regsByEvent.get(event.$id) || 0;
      event.currentRegistrations = occupancy;

      const deadlinePassed = isEventDeadlinePassed(event);
      const maxAllowed = getEventSlotLimit(event);
      if (deadlinePassed || Boolean(maxAllowed && occupancy >= maxAllowed)) {
        event.status = "closed";
      }
    }

    return events;
  }

  private async countEventOccupancy(event: EventDocument): Promise<number> {
    if (isTeamEvent(event)) {
      try {
        const teams = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          [Query.equal("eventId", event.$id), Query.limit(500)],
        );
        const count = teams.documents.filter((team: any) => {
          const status = String(team.status || "");
          return (
            status !== "cancelled" &&
            status !== "disbanded" &&
            status !== "disqualified"
          );
        }).length;
        if (count > 0) return count;
      } catch {
        // Fall back to distinct teamId in event_registrations
      }

      // Robust fallback: count distinct teams from event_registrations (which has public read permission)
      try {
        const regs = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("eventId", event.$id), Query.limit(500)],
        );
        const distinctTeams = new Set(
          regs.documents
            .map((r: any) => r.teamId)
            .filter((tid: any): tid is string => Boolean(tid)),
        );
        return distinctTeams.size;
      } catch {
        return 0;
      }
    }

    const regs = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      APPWRITE_CONFIG.collections.eventRegistrations,
      [Query.equal("eventId", event.$id), Query.limit(1)],
    );
    return regs.total ?? regs.documents.length;
  }

  private async persistOccupancy(
    eventId: string,
    occupancy: number,
    maxAllowed: number,
    currentlyPublished: boolean,
  ): Promise<void> {
    const shouldClose = Boolean(
      maxAllowed && occupancy >= maxAllowed && currentlyPublished,
    );
    if (shouldClose) {
      await this.closeEventRegistration(eventId, occupancy);
      return;
    }
    try {
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.events,
        eventId,
        { currentRegistrations: occupancy },
      );
    } catch {
      // currentRegistrations may be absent from the Appwrite schema
    }
  }

  private async closeEventIfWindowEnded(
    event: EventDocument,
    wait: boolean,
  ): Promise<void> {
    const deadlinePassed = isEventDeadlinePassed(event);
    if (deadlinePassed) {
      const task = this.disqualifyIncompleteTeams(event);
      if (wait) await task;
      else task.catch(() => {});
    }

    if (event.status !== "published") return;
    const occupancy = Number(event.currentRegistrations || 0);
    const maxAllowed = getEventSlotLimit(event);
    const shouldClose =
      deadlinePassed || Boolean(maxAllowed && occupancy >= maxAllowed);
    if (!shouldClose) return;
    event.status = "closed";
    const task = this.closeEventRegistration(event.$id, occupancy);
    if (wait) await task;
    else task.catch(() => {});
  }

  private async closeEventRegistration(
    eventId: string,
    occupancy: number,
  ): Promise<void> {
    try {
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.events,
        eventId,
        { status: "closed", currentRegistrations: occupancy },
      );
    } catch {
      await databases
        .updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.events,
          eventId,
          { status: "closed" },
        )
        .catch(() => {});
    }
  }

  /** Disqualify teams that did not reach the event minimum before its deadline. */
  private async disqualifyIncompleteTeams(event: EventDocument): Promise<void> {
    if (!isTeamEvent(event)) return;

    const [teamsRes, invitesRes] = await Promise.all([
      databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        [Query.equal("eventId", event.$id), Query.limit(500)],
      ),
      databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teamInvitations,
        [
          Query.equal("eventId", event.$id),
          Query.equal("status", "accepted"),
          Query.limit(500),
        ],
      ),
    ]);

    const acceptedByTeam = new Map<string, number>();
    for (const invite of invitesRes.documents as any[]) {
      acceptedByTeam.set(
        invite.teamId,
        (acceptedByTeam.get(invite.teamId) || 0) + 1,
      );
    }

    await Promise.all(
      (teamsRes.documents as any[]).map(async (team) => {
        const status = String(team.status || "");
        if (
          status === "cancelled" ||
          status === "disbanded" ||
          status === "disqualified"
        )
          return;

        const teamSize = 1 + (acceptedByTeam.get(team.$id) || 0);
        if (teamSize >= (event.minTeamSize || 2)) return;

        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          team.$id,
          { status: "disqualified" },
        );
      }),
    );
  }
}

export const eventsService = new EventsService();
