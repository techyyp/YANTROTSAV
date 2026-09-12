import { ID, Query, Permission, Role } from "appwrite";
import { databases } from "./client";
import { APPWRITE_CONFIG } from "../../config/appwrite.config";
import { eventsService } from "./events.service";
import { mapAppwriteError, AppError } from "./errorMapper";
import type {
  TeamDocument,
  TeamInvitationDocument,
  EventRegistrationDocument,
  CreateTeamDTO,
  SoloRegistrationDTO,
  TeamInviteEmailPayload,
} from "../../types/database.types";

export interface TeamMemberItem {
  name: string;
  username?: string;
  email: string;
  role: "Leader" | "Member";
  status: string;
  invitationId?: string;
  userId?: string;
}

export interface UserTeamInfo extends TeamDocument {
  userRole: "Leader" | "Member";
  eventTitle?: string;
  teamName: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  isDisbandRequested?: boolean;
  members?: TeamMemberItem[];
}

/**
 * Intelligent helper to resolve prospective teammate from raw handle, email, or roll number.
 * Supports normalization, exact lookup, and fuzzy typo detection with suggestions.
 */
function resolveProspectiveTeammate(
  rawInput: string,
  allUsers: any[],
): {
  resolvedEmail: string;
  inviteeName: string;
  inviteeUsername: string;
  inviteeUserId: string;
  matchedUser?: any;
} {
  const input = (rawInput || "").trim();
  const clean = input.replace(/^@/, "").trim();
  const isExplicitHandle = input.startsWith("@");
  const hasEmailAt = clean.includes("@");

  if (!clean) {
    throw new AppError(
      "Please enter a valid student email, username, or roll number.",
      "UNKNOWN_ERROR",
      400,
    );
  }

  // 1. If it contains @ and is formatted as an email
  if (hasEmailAt) {
    const emailLower = clean.toLowerCase();
    const matched = allUsers.find(
      (u: any) => (u.email || "").toLowerCase() === emailLower,
    );
    if (matched) {
      const username =
        matched.userId || matched.username || emailLower.split("@")[0];
      return {
        resolvedEmail: emailLower,
        inviteeName: matched.fullName || matched.name || username,
        inviteeUsername: username,
        inviteeUserId: matched.$id,
        matchedUser: matched,
      };
    }
    // Unregistered email is allowed to receive an external invite
    return {
      resolvedEmail: emailLower,
      inviteeName: clean.split("@")[0],
      inviteeUsername: clean.split("@")[0],
      inviteeUserId: "",
    };
  }

  const cleanAlphaNum = clean.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const isLikelyRoll = !isExplicitHandle && /\d/.test(clean);
  const identifierType = isExplicitHandle
    ? "Username"
    : isLikelyRoll
      ? "Roll Number"
      : "Username / Roll No";

  // 2. Exact or normalized matching against registered profiles
  const matched = allUsers.find((u: any) => {
    const uUserId = (u.userId || "").toLowerCase();
    const uRoll = (u.rollNumber || u.rollNo || "").toLowerCase();
    const uRollNorm = uRoll.replace(/[^a-zA-Z0-9]/g, "");
    const uEmail = (u.email || "").toLowerCase();
    const uEmailPrefix = uEmail.includes("@") ? uEmail.split("@")[0] : "";
    const uName = (u.fullName || u.name || "").toLowerCase();

    return (
      (cleanAlphaNum && uRollNorm === cleanAlphaNum) ||
      uRoll === clean.toLowerCase() ||
      uUserId === clean.toLowerCase() ||
      (uEmailPrefix && uEmailPrefix === clean.toLowerCase()) ||
      uEmail === clean.toLowerCase() ||
      uName === clean.toLowerCase()
    );
  });

  if (matched && matched.email && matched.email.includes("@")) {
    const username = matched.userId || matched.username || clean;
    return {
      resolvedEmail: matched.email.trim().toLowerCase(),
      inviteeName: matched.fullName || matched.name || username,
      inviteeUsername: username,
      inviteeUserId: matched.$id,
      matchedUser: matched,
    };
  }

  throw new AppError(
    `No registered student found with ${identifierType} "${clean}". Please verify the ${identifierType.toLowerCase()} or make sure they have created an account on Yantrotsav.`,
    "UNKNOWN_ERROR",
    404,
  );
}

function buildUsernameByEmailLookup(allUsers: any[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const user of allUsers) {
    const email = (user.email || "").trim().toLowerCase();
    if (!email) continue;
    const username =
      user.userId ||
      user.username ||
      (email.includes("@") ? email.split("@")[0] : email);
    if (username) lookup.set(email, username);
  }
  return lookup;
}

function resolveInviteeUsername(
  invite: TeamInvitationDocument,
  usernameByEmail: Map<string, string>,
): string {
  const stored = (invite.inviteeUsername || "").trim();
  if (stored) return stored;
  const email = (invite.inviteeEmail || "").trim().toLowerCase();
  if (email && usernameByEmail.has(email)) return usernameByEmail.get(email)!;
  return email.includes("@") ? email.split("@")[0] : email || "member";
}

/**
 * Maximum number of distinct events any student is permitted to register for
 * across the entire Yantrotsav festival (solo + team registrations combined).
 */
export const MAX_EVENT_REGISTRATIONS_PER_USER = 3;

export class TeamsService {
  /**
   * Enforces the festival-wide maximum limit of 3 event registrations per student.
   * Checks if user has already reached MAX_EVENT_REGISTRATIONS_PER_USER across all events.
   */
  async assertWithinRegistrationLimit(
    userId: string,
    targetEventId: string,
    identifiers: string[] = [],
    customErrorMessage?: string,
  ): Promise<void> {
    if (!userId && (!identifiers || identifiers.length === 0)) return;
    let userRegs: EventRegistrationDocument[];
    try {
      userRegs = await this.getUserRegistrations(userId, identifiers);
    } catch (regErr) {
      console.error(
        "assertWithinRegistrationLimit: Failed to fetch registrations, blocking registration as a safety measure.",
        regErr,
      );
      throw new AppError(
        "Unable to verify your registration count. Please try again in a moment.",
        "UNKNOWN_ERROR",
        503,
      );
    }
    const isAlreadyInThisEvent = userRegs.some((r) => r.eventId === targetEventId);

    if (!isAlreadyInThisEvent && userRegs.length >= MAX_EVENT_REGISTRATIONS_PER_USER) {
      throw new AppError(
        customErrorMessage ||
          `Registration limit reached: You have already registered for ${userRegs.length} events. Each student is allowed a maximum of ${MAX_EVENT_REGISTRATIONS_PER_USER} event registrations across Yantrotsav 2026.`,
        "LIMIT_EXCEEDED",
        400,
      );
    }
  }

  /**
   * Register a user for a Solo event
   * Direct document write to event_registrations collection
   */
  async registerSolo(
    data: SoloRegistrationDTO,
  ): Promise<EventRegistrationDocument> {
    throw new AppError(
      "Registrations for Yantrotsav 2026 events are now officially closed.",
      "EVENT_REGISTRATION_CLOSED",
      400,
    );
    try {
      // 1. Fetch and validate event
      const event = await eventsService.getEventById(data.eventId);
      await eventsService.assertHasCapacity(event);

      // 1.1 Enforce festival-wide 3 events per student limit
      await this.assertWithinRegistrationLimit(
        data.userId,
        data.eventId,
        [data.studentEmail, data.studentName],
      );

      // Strict validation: studentEmail must be a valid email
      if (!data.userId || !data.userId.trim()) {
        throw new AppError(
          "Student User ID is required.",
          "UNKNOWN_ERROR",
          400,
        );
      }
      if (!data.studentEmail || !data.studentEmail.includes("@")) {
        throw new AppError(
          "A valid student email address is required.",
          "UNKNOWN_ERROR",
          400,
        );
      }
      if (!data.studentName || !data.studentName.trim()) {
        throw new AppError("Student name is required.", "UNKNOWN_ERROR", 400);
      }

      // 2. Comprehensive check for duplicate registration (solo, team leader, or member)
      const isAlreadyEnrolled = await this.checkUserEventEnrollment(
        data.eventId,
        data.userId,
        [data.studentEmail, data.studentName],
      );
      if (isAlreadyEnrolled.enrolled) {
        throw new AppError(
          `You are already enrolled in this event (${isAlreadyEnrolled.reason || "Existing registration"}). Duplicate registrations are not permitted.`,
          "ALREADY_REGISTERED",
          409,
        );
      }

      // 3. Ensure active document does not already exist before creating (auto-healing orphaned registrations)
      try {
        const existingCheck = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("eventId", data.eventId), Query.limit(100)],
        );
        for (const d of existingCheck.documents) {
          const dUserId = ((d as any).userId || "").toLowerCase();
          const dEmail = ((d as any).userEmail || "").toLowerCase();
          const isUserMatch =
            (data.userId && dUserId === data.userId.toLowerCase()) ||
            (data.studentEmail &&
              dEmail === data.studentEmail.trim().toLowerCase());

          if (isUserMatch) {
            const dTeamId = (d as any).teamId;
            if (dTeamId) {
              // Verify if the referenced team is actually alive and not cancelled
              try {
                const teamDoc = (await databases.getDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teams,
                  dTeamId,
                )) as any;
                if (
                  !teamDoc ||
                  teamDoc.status === "cancelled" ||
                  teamDoc.status === "disbanded" ||
                  teamDoc.status === "disqualified"
                ) {
                  // Dead team registration; purge and proceed
                  await databases
                    .deleteDocument(
                      APPWRITE_CONFIG.databaseId,
                      APPWRITE_CONFIG.collections.eventRegistrations,
                      d.$id,
                    )
                    .catch(() => {});
                  continue;
                }
              } catch {
                // Team deleted; purge orphaned row and proceed
                await databases
                  .deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.eventRegistrations,
                    d.$id,
                  )
                  .catch(() => {});
                continue;
              }
            }

            throw new AppError(
              "You are already registered for this event. Duplicate registrations are not permitted.",
              "ALREADY_REGISTERED",
              409,
            );
          }
        }
      } catch (err: any) {
        if (err instanceof AppError) throw err;
      }

      const docPermissions = [
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ];

      // 1. Create document in event_registrations with strictly valid schema attributes
      const regDoc = await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.eventRegistrations,
        ID.unique(),
        {
          eventId: data.eventId,
          userId: data.userId,
          userName: data.studentName,
          userEmail: data.studentEmail,
          registeredAt: new Date().toISOString(),
        },
        docPermissions,
      );

      // 1.1 Dual-write to `teams` collection so solo registrations ALSO appear in Appwrite Console `teams` table and Admin directory
      let mirrorTeamId = "";
      try {
        const teamDoc = await databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          ID.unique(),
          {
            name: `${data.studentName} (Solo)`,
            eventId: data.eventId,
            leaderId: data.userId,
            leaderName: data.studentName,
            leaderEmail: data.studentEmail,
            status: "confirmed",
          },
          docPermissions,
        );

        if (teamDoc?.$id) {
          mirrorTeamId = teamDoc.$id;
          await databases
            .updateDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.eventRegistrations,
              regDoc.$id,
              { teamId: mirrorTeamId },
            )
            .catch(() => {});
        }
      } catch (teamMirrorErr) {
        console.warn("[registerSolo] Mirroring to teams collection non-blocking notice:", teamMirrorErr);
      }

      // 2. Safely sync student profile attributes (phone, rollNumber, department, etc.) to the users collection
      try {
        const userUpdatePayload: Record<string, any> = {};
        const phone = String(data.studentPhone || '').trim();
        if (phone) userUpdatePayload.phone = phone;

        const roll = String(data.studentRollNumber || data.studentRollNo || '').trim();
        if (roll) userUpdatePayload.rollNumber = roll;

        const dept = String(data.department || '').trim();
        if (dept) userUpdatePayload.department = dept;

        const sem = String(data.semester || '').trim();
        if (sem) userUpdatePayload.semester = sem;

        const col = String(data.collegeName || '').trim();
        if (col) userUpdatePayload.college = col;

        if (Object.keys(userUpdatePayload).length > 0 && data.userId) {
          try {
            await databases.updateDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.users,
              data.userId,
              userUpdatePayload,
            );
          } catch (syncErr: any) {
            const isNotFound =
              syncErr?.code === 404 ||
              syncErr?.type === "document_not_found" ||
              syncErr?.message?.toLowerCase().includes("not found");
            if (isNotFound) {
              const studentHandle =
                data.studentEmail?.split("@")[0] ||
                data.studentName?.toLowerCase().replace(/[^a-z0-9._]/g, "") ||
                data.userId;
              await databases
                .createDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.users,
                  data.userId,
                  {
                    userId: studentHandle.slice(0, 128),
                    fullName: (data.studentName || studentHandle).slice(0, 128),
                    email: data.studentEmail?.slice(0, 128) || "",
                    phone: (data.studentPhone?.trim() || "").slice(0, 32),
                    department: data.department?.trim() || "",
                    semester: data.semester?.trim() || "",
                    rollNumber: roll.slice(0, 128),
                    ...userUpdatePayload,
                  },
                  docPermissions,
                )
                .catch(() => {});
            }
          }
        }
      } catch {
        // Non-blocking background sync
      }

      await eventsService.syncOccupancy(data.eventId).catch(() => {});

      return {
        ...regDoc,
        teamId: mirrorTeamId || (regDoc as any).teamId,
        eventTitle: event.title,
        registrationType: "solo",
        studentName: data.studentName,
        studentEmail: data.studentEmail,
      } as unknown as EventRegistrationDocument;
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.registerSolo");
    }
  }

  /**
   * Create a Team and dispatch invitations to prospective members
   */
  async createTeam(data: CreateTeamDTO): Promise<TeamDocument> {
    throw new AppError(
      "Registrations for Yantrotsav 2026 events are now officially closed.",
      "EVENT_REGISTRATION_CLOSED",
      400,
    );
    try {
      const event = await eventsService.getEventById(data.eventId);
      await eventsService.assertHasCapacity(event);

      // Validate leader credentials
      if (!data.leaderEmail || !data.leaderEmail.includes("@")) {
        throw new AppError(
          "A valid leader email address is required.",
          "UNKNOWN_ERROR",
          400,
        );
      }
      if (!data.leaderName || !data.leaderName.trim()) {
        throw new AppError("Leader name is required.", "UNKNOWN_ERROR", 400);
      }

      // Filter out leader's own email/username if passed in members list
      const cleanMemberEmails = [
        ...new Set(
          data.memberEmails
            .map((item) => item.trim())
            .filter(
              (item) =>
                item &&
                item.toLowerCase() !== data.leaderEmail.trim().toLowerCase(),
            ),
        ),
      ];

      // Fetch users list for resolving student handles (username, roll number, or email)
      const allUsersRes = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.limit(500)],
        )
        .catch(() => ({ documents: [] }));

      // Pre-resolve all teammates to guaranteed valid registered emails and student names
      const resolvedMembers: Array<{
        rawHandle: string;
        email: string;
        name: string;
        username: string;
        userId: string;
      }> = [];

      for (const rawMember of cleanMemberEmails) {
        const cleanHandle = rawMember.replace(/^@/, "").trim();
        const resolved = resolveProspectiveTeammate(
          rawMember,
          allUsersRes.documents,
        );
        const resolvedEmail = resolved.resolvedEmail;
        const inviteeName = resolved.inviteeName;
        const inviteeUserId = resolved.inviteeUserId;
        const inviteeUsername = resolved.inviteeUsername;

        if (!resolvedEmail || !resolvedEmail.includes("@")) {
          throw new AppError(
            `Invalid email format for teammate "${rawMember}". Please enter a valid registered email or username.`,
            "UNKNOWN_ERROR",
            400,
          );
        }

        if (resolvedEmail === data.leaderEmail.trim().toLowerCase()) {
          throw new AppError(
            "You cannot invite yourself as a teammate.",
            "UNKNOWN_ERROR",
            400,
          );
        }

        if (resolvedMembers.some((m) => m.email === resolvedEmail)) {
          throw new AppError(
            `Teammate "${rawMember}" is added more than once.`,
            "UNKNOWN_ERROR",
            400,
          );
        }

        // Check if invited teammate is already enrolled for this event
        const memberEnrolled = await this.checkUserEventEnrollment(
          data.eventId,
          inviteeUserId || resolvedEmail,
          [resolvedEmail, cleanHandle, inviteeName],
        );
        if (memberEnrolled.enrolled) {
          throw new AppError(
            `Teammate "${inviteeName || cleanHandle}" is already enrolled in this event (${memberEnrolled.reason || "Existing registration"}).`,
            "ALREADY_REGISTERED",
            409,
          );
        }

        // Check if invited teammate has already reached the maximum limit of 3 events
        const memberLookupId = inviteeUserId || resolvedEmail;
        if (memberLookupId) {
          await this.assertWithinRegistrationLimit(
            memberLookupId,
            data.eventId,
            [resolvedEmail, cleanHandle, inviteeName],
            `Teammate "${inviteeName || cleanHandle}" has already reached the maximum limit of ${MAX_EVENT_REGISTRATIONS_PER_USER} event registrations.`,
          );
        }

        resolvedMembers.push({
          rawHandle: cleanHandle,
          email: resolvedEmail,
          name: inviteeName,
          username: inviteeUsername,
          userId: inviteeUserId,
        });
      }

      const targetTeamSize = resolvedMembers.length + 1; // Including leader

      if (targetTeamSize < event.minTeamSize) {
        throw new AppError(
          `Minimum team size for ${event.title} is ${event.minTeamSize}.`,
          "UNKNOWN_ERROR",
          400,
        );
      }

      if (targetTeamSize > event.maxTeamSize) {
        throw new AppError(
          `Maximum team size for ${event.title} is ${event.maxTeamSize}.`,
          "TEAM_FULL",
          400,
        );
      }

      // Check if leader has reached the festival-wide 3 events limit
      await this.assertWithinRegistrationLimit(
        data.leaderId,
        data.eventId,
        [data.leaderEmail, data.leaderName],
        `Registration limit reached: As team leader, you have already registered for ${MAX_EVENT_REGISTRATIONS_PER_USER} events (the maximum allowed is ${MAX_EVENT_REGISTRATIONS_PER_USER} events per student across the fest).`,
      );

      // Check if leader is already enrolled or formed a team for this event
      const isAlreadyEnrolled = await this.checkUserEventEnrollment(
        data.eventId,
        data.leaderId,
        [data.leaderEmail, data.leaderName],
      );
      if (isAlreadyEnrolled.enrolled) {
        throw new AppError(
          `You are already enrolled in this event (${isAlreadyEnrolled.reason || "Existing registration"}). Duplicate registrations are not permitted.`,
          "ALREADY_REGISTERED",
          409,
        );
      }

      const docPermissions = [
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ];

      // 1. Create team document matching exact Appwrite schema attributes
      const teamDoc = await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        ID.unique(),
        {
          name: data.teamName.trim(),
          eventId: data.eventId,
          leaderId: data.leaderId,
          leaderName: data.leaderName.trim(),
          leaderEmail: data.leaderEmail.trim().toLowerCase(),
          status: "pending",
        },
        docPermissions,
      );

      // Register leader immediately in event_registrations (auto-healing any orphaned records)
      try {
        const existingLeaderReg = await databases
          .listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            [Query.equal("eventId", data.eventId), Query.limit(100)],
          )
          .catch(() => ({ documents: [] }));

        let needToCreateLeaderReg = true;
        for (const d of existingLeaderReg.documents) {
          const dUserId = ((d as any).userId || "").toLowerCase();
          const dEmail = ((d as any).userEmail || "").toLowerCase();
          const isMatch =
            (data.leaderId && dUserId === data.leaderId.toLowerCase()) ||
            (data.leaderEmail &&
              dEmail === data.leaderEmail.trim().toLowerCase());

          if (isMatch) {
            const dTeamId = (d as any).teamId;
            if (dTeamId && dTeamId !== teamDoc.$id) {
              try {
                const oldTeam = (await databases.getDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teams,
                  dTeamId,
                )) as any;
                if (
                  !oldTeam ||
                  oldTeam.status === "cancelled" ||
                  oldTeam.status === "disbanded" ||
                  oldTeam.status === "disqualified"
                ) {
                  // Dead team registration; purge it
                  await databases
                    .deleteDocument(
                      APPWRITE_CONFIG.databaseId,
                      APPWRITE_CONFIG.collections.eventRegistrations,
                      d.$id,
                    )
                    .catch(() => {});
                } else {
                  needToCreateLeaderReg = false;
                }
              } catch {
                // Old team deleted; purge
                await databases
                  .deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.eventRegistrations,
                    d.$id,
                  )
                  .catch(() => {});
              }
            } else if (!dTeamId) {
              // Existing registration was solo; update it to link with new team
              try {
                await databases.updateDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.eventRegistrations,
                  d.$id,
                  { teamId: teamDoc.$id },
                );
                needToCreateLeaderReg = false;
              } catch {
                // If update fails, create new doc
              }
            } else {
              needToCreateLeaderReg = false;
            }
          }
        }

        if (needToCreateLeaderReg) {
          await databases.createDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            ID.unique(),
            {
              eventId: data.eventId,
              teamId: teamDoc.$id,
              userId: data.leaderId,
              userName: data.leaderName.trim(),
              userEmail: data.leaderEmail.trim().toLowerCase(),
              registeredAt: new Date().toISOString(),
            },
            [
              Permission.read(Role.any()),
              Permission.update(Role.any()),
              Permission.delete(Role.any()),
            ],
          );
        }
      } catch (leaderRegErr) {
        console.warn("Leader registration note:", leaderRegErr);
      }

      // 2. Batch create invitations with validated emails and names
      for (const member of resolvedMembers) {
        try {
          const invitePermissions = [
            Permission.read(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.any()),
          ];

          const invDoc = await databases.createDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teamInvitations,
            ID.unique(),
            {
              teamId: teamDoc.$id,
              eventId: data.eventId,
              eventTitle: event.title,
              inviterId: data.leaderId,
              inviterName: data.leaderName.trim(),
              inviteeEmail: member.email,
              status: "pending",
            },
            invitePermissions,
          );

          const targetDomain =
            APPWRITE_CONFIG.appUrl &&
            !APPWRITE_CONFIG.appUrl.includes("localhost")
              ? APPWRITE_CONFIG.appUrl
              : "https://yantrotsavv10.vercel.app";
          await this.dispatchInviteEmail({
            toEmail: member.email,
            inviteeName: member.name,
            teamName: data.teamName.trim(),
            eventTitle: event.title,
            actionUrl: `${targetDomain}/dashboard?inviteId=${invDoc.$id}`,
          });
        } catch (inviteErr) {
          console.warn(
            `Failed to process invitation for ${member.email}:`,
            inviteErr,
          );
        }
      }

      await eventsService.syncOccupancy(data.eventId).catch(() => {});

      return teamDoc as unknown as TeamDocument;
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.createTeam");
    }
  }

  /**
   * Handle student invitation response (Accept / Decline)
   * Auto-confirms team and writes event_registrations once target size is met
   */
  async respondToInvitation(params: {
    invitationId: string;
    response: "accepted" | "declined";
    student: {
      userId: string;
      name: string;
      email: string;
      phone?: string;
      rollNo?: string;
      college?: string;
    };
  }): Promise<void> {
    try {
      let invite: TeamInvitationDocument;
      try {
        invite = (await databases.getDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          params.invitationId,
        )) as unknown as TeamInvitationDocument;
      } catch {
        throw new AppError(
          "This invitation has been revoked by the team leader or is no longer available.",
          "INVITATION_NOT_FOUND",
          404,
        );
      }

      if (invite.status !== "pending") {
        throw new AppError(
          "This invitation has already been processed or cancelled.",
          "INVITATION_ALREADY_RESPONDED",
          400,
        );
      }

      // Fetch team with safety check
      let team: TeamDocument;
      try {
        team = (await databases.getDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          invite.teamId,
        )) as unknown as TeamDocument;
      } catch {
        throw new AppError(
          "The squad for this invitation has been cancelled or disbanded.",
          "TEAM_NOT_FOUND",
          404,
        );
      }

      if (
        team.status === "cancelled" ||
        (team.status as any) === "disbanded" ||
        (team.status as any) === "disqualified"
      ) {
        throw new AppError(
          "This squad was cancelled by the team leader and is no longer accepting members.",
          "TEAM_NOT_FOUND",
          400,
        );
      }

      // If accepting, enforce the festival-wide 3 events limit
      if (params.response === "accepted") {
        await this.assertWithinRegistrationLimit(
          params.student.userId,
          team.eventId,
          [params.student.email, invite.inviteeEmail, params.student.name],
          `Cannot accept invitation: You have already registered for ${MAX_EVENT_REGISTRATIONS_PER_USER} events (the maximum allowed per student across Yantrotsav 2026).`,
        );
      }

      // Update invitation document status
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teamInvitations,
        params.invitationId,
        {
          status: params.response,
        },
      );

      if (params.response === "declined") {
        return;
      }

      // Fetch event to know required team size
      const event = await eventsService
        .getEventById(team.eventId)
        .catch(() => null);
      const targetTeamSize = event?.minTeamSize || 2;

      // Count accepted invitations for this team
      const acceptedInvitesRes = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teamInvitations,
        [Query.equal("teamId", team.$id), Query.equal("status", "accepted")],
      );

      const totalAccepted = acceptedInvitesRes.total + 1; // +1 for leader

      // Immediately create registration for this accepted student (if not already registered)
      try {
        let studentUserId = (params.student.userId || "").trim();
        let studentEmail = (params.student.email || "").trim().toLowerCase();
        let studentName = (params.student.name || "").trim();

        // Fallback: If studentEmail does not contain @, try invite.inviteeEmail
        if (
          !studentEmail.includes("@") &&
          invite.inviteeEmail &&
          invite.inviteeEmail.includes("@")
        ) {
          studentEmail = invite.inviteeEmail.trim().toLowerCase();
        }

        // If studentName is empty or equals email/userId, fetch from invite or username
        if (
          !studentName ||
          studentName === studentEmail ||
          studentName === studentUserId
        ) {
          studentName =
            invite.inviteeName ||
            (studentEmail.includes("@")
              ? studentEmail.split("@")[0]
              : "Student");
        }

        // Only create registration if studentEmail is a valid email
        if (studentEmail.includes("@")) {
          const existing = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            [Query.equal("eventId", team.eventId), Query.limit(100)],
          );

          const alreadyExists = existing.documents.some((d: any) => {
            const dUserId = ((d as any).userId || "").toLowerCase();
            const dEmail = ((d as any).userEmail || "").toLowerCase();
            return (
              (studentUserId && dUserId === studentUserId.toLowerCase()) ||
              (studentEmail && dEmail === studentEmail)
            );
          });

          if (!alreadyExists) {
            await databases.createDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.eventRegistrations,
              ID.unique(),
              {
                eventId: team.eventId,
                teamId: team.$id,
                userId: studentUserId,
                userName: studentName,
                userEmail: studentEmail,
                registeredAt: new Date().toISOString(),
              },
              [
                Permission.read(Role.any()),
                Permission.update(Role.any()),
                Permission.delete(Role.any()),
              ],
            );
          }
        }
      } catch (regErr) {
        console.warn("Member event registration creation error:", regErr);
      }

      // Also ensure leader is registered (if not already registered)
      try {
        const leaderId = (team.leaderId || "").trim().toLowerCase();
        const leaderEmail = (team.leaderEmail || "").trim().toLowerCase();
        const leaderCheck = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("eventId", team.eventId), Query.limit(100)],
        );
        const leaderAlreadyRegistered = leaderCheck.documents.some((d: any) => {
          const dUserId = ((d as any).userId || "").toLowerCase();
          const dEmail = ((d as any).userEmail || "").toLowerCase();
          return (
            (leaderId && dUserId === leaderId) ||
            (leaderEmail && dEmail === leaderEmail)
          );
        });
        if (!leaderAlreadyRegistered) {
          await databases.createDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            ID.unique(),
            {
              eventId: team.eventId,
              teamId: team.$id,
              userId: team.leaderId,
              userName: team.leaderName,
              userEmail: team.leaderEmail,
              registeredAt: new Date().toISOString(),
            },
            [
              Permission.read(Role.any()),
              Permission.update(Role.any()),
              Permission.delete(Role.any()),
            ],
          );
        }
      } catch (leaderErr) {
        console.warn("Leader registration note in accept:", leaderErr);
      }

      // When all required members accepted, confirm team
      if (totalAccepted >= targetTeamSize) {
        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          team.$id,
          {
            status: "confirmed",
          },
        );

        await eventsService.syncOccupancy(team.eventId).catch(() => {});
      }
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.respondToInvitation");
    }
  }

  /**
   * List invitations matching any of the student's identifiers (email, username, roll number, email handle)
   */
  async getUserInvitations(
    emailOrIdentifiers: string | string[],
  ): Promise<TeamInvitationDocument[]> {
    try {
      const identifiers = Array.isArray(emailOrIdentifiers)
        ? emailOrIdentifiers
        : [emailOrIdentifiers];

      const cleanIds = [
        ...new Set(
          identifiers
            .map((id) =>
              typeof id === "string" ? id.trim().toLowerCase() : "",
            )
            .filter((id): id is string => Boolean(id && id.length > 0)),
        ),
      ];

      if (cleanIds.length === 0) return [];

      const foundDocsMap = new Map<string, TeamInvitationDocument>();

      // 1. Try querying Appwrite with array of identifiers
      try {
        const response = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [
            Query.equal("inviteeEmail", cleanIds),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ],
        );
        for (const doc of response.documents) {
          foundDocsMap.set(doc.$id, doc as unknown as TeamInvitationDocument);
        }
      } catch {
        // Fallback to querying each identifier individually if array query is not indexed
        for (const id of cleanIds) {
          try {
            const singleRes = await databases.listDocuments(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.teamInvitations,
              [
                Query.equal("inviteeEmail", id),
                Query.orderDesc("$createdAt"),
                Query.limit(50),
              ],
            );
            for (const doc of singleRes.documents) {
              foundDocsMap.set(
                doc.$id,
                doc as unknown as TeamInvitationDocument,
              );
            }
          } catch {
            // continue
          }
        }
      }

      // 2. Also fetch all pending invitations to catch any match where inviter typed username or partial handle
      try {
        const pendingResponse = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [
            Query.equal("status", "pending"),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ],
        );

        for (const doc of pendingResponse.documents) {
          const inv = doc as unknown as TeamInvitationDocument;
          const invEmail = (inv.inviteeEmail || "").trim().toLowerCase();
          if (!invEmail) continue;

          const isMatch = cleanIds.some(
            (myId) =>
              invEmail === myId ||
              (invEmail.includes("@") && invEmail.split("@")[0] === myId) ||
              (myId.includes("@") && myId.split("@")[0] === invEmail),
          );

          if (isMatch) {
            foundDocsMap.set(inv.$id, inv);
          }
        }
      } catch {
        // Safe to ignore if broad pending list is restricted
      }

      const allEvents = await eventsService.getEvents().catch(() => []);
      const teamsRes = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          [Query.limit(500)],
        )
        .catch(() => ({ documents: [] }));
      const activeTeamsMap = new Map(
        teamsRes.documents.map((t: any) => [t.$id, t]),
      );

      const results = Array.from(foundDocsMap.values()).filter((inv) => {
        const evt = allEvents.find((e) => e.$id === inv.eventId);
        if (!evt) {
          return false;
        }
        if (inv.teamId) {
          const parentTeam = activeTeamsMap.get(inv.teamId);
          if (
            !parentTeam ||
            parentTeam.status === "cancelled" ||
            parentTeam.status === "disbanded" ||
            parentTeam.status === "disqualified"
          ) {
            return false;
          }
        }
        return true;
      });
      results.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
      );
      return results;
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.getUserInvitations");
    }
  }

  /**
   * List teams led by a specific user
   */
  async getLeaderTeams(leaderId: string): Promise<TeamDocument[]> {
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        [Query.equal("leaderId", leaderId), Query.orderDesc("$createdAt")],
      );

      return (response.documents as unknown as TeamDocument[]).filter(
        (t) =>
          t.status !== "cancelled" &&
          (t.status as any) !== "disbanded" &&
          (t.status as any) !== "disqualified",
      );
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.getLeaderTeams");
    }
  }

  /**
   * List all teams a user is part of (both as Leader and as accepted Member)
   */
  async getUserTeams(
    userId: string,
    emailOrIdentifiers?: string | string[],
  ): Promise<UserTeamInfo[]> {
    try {
      const teamsMap = new Map<string, UserTeamInfo>();
      const allEvents = await eventsService.getEvents().catch(() => []);

      // 1. Fetch teams where user is leader
      try {
        const leaderRes = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          [
            Query.equal("leaderId", userId),
            Query.orderDesc("$createdAt"),
            Query.limit(100),
          ],
        );
        for (const doc of leaderRes.documents) {
          const t = doc as unknown as TeamDocument;
          // Filter out cancelled or disbanded teams
          if (
            t.status === "cancelled" ||
            (t.status as any) === "disbanded" ||
            (t.status as any) === "disqualified" ||
            (t.name && t.name.includes("(Solo)"))
          ) {
            continue;
          }
          const evt = allEvents.find((e) => e.$id === t.eventId);
          // If the event no longer exists, skip orphaned team
          if (!evt) {
            continue;
          }

          const rawName = t.name || t.teamName || "Team";
          const isDisbandRequested = rawName.includes("[DISBAND REQUESTED]");
          const cleanDisplayName = rawName
            .replace("[DISBAND REQUESTED]", "")
            .trim();

          teamsMap.set(t.$id, {
            ...t,
            userRole: "Leader",
            teamName: cleanDisplayName || "Team",
            eventTitle: evt.title,
            minTeamSize: evt.minTeamSize,
            maxTeamSize: evt.maxTeamSize,
            isDisbandRequested,
          });
        }
      } catch (err) {
        console.warn("Error fetching leader teams:", err);
      }

      // 2. Fetch accepted invitations to find teams where user is an accepted Member
      const identifiers = emailOrIdentifiers
        ? Array.isArray(emailOrIdentifiers)
          ? emailOrIdentifiers
          : [emailOrIdentifiers]
        : [];

      const cleanIds = [
        userId,
        ...identifiers.map((id) =>
          typeof id === "string" ? id.trim().toLowerCase() : "",
        ),
      ].filter((id): id is string => Boolean(id && id.length > 0));

      try {
        const acceptedInvitesRes = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [Query.equal("status", "accepted"), Query.limit(100)],
        );

        for (const inv of acceptedInvitesRes.documents) {
          const invData = inv as unknown as TeamInvitationDocument;
          const invEmail = (invData.inviteeEmail || "").trim().toLowerCase();
          const isMatch = cleanIds.some(
            (id) =>
              id === invEmail ||
              (invEmail.includes("@") && invEmail.split("@")[0] === id) ||
              (id.includes("@") && id.split("@")[0] === invEmail),
          );

          if (isMatch && invData.teamId && !teamsMap.has(invData.teamId)) {
            try {
              const teamDoc = (await databases.getDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.teams,
                invData.teamId,
              )) as unknown as TeamDocument;

              if (
                teamDoc.status === "cancelled" ||
                (teamDoc.status as any) === "disbanded" ||
                (teamDoc.status as any) === "disqualified"
              ) {
                continue;
              }

              const evt = allEvents.find((e) => e.$id === teamDoc.eventId);
              if (!evt) {
                continue;
              }

              const rawName = teamDoc.name || teamDoc.teamName || "Team";
              const isDisbandRequested = rawName.includes(
                "[DISBAND REQUESTED]",
              );
              const cleanDisplayName = rawName
                .replace("[DISBAND REQUESTED]", "")
                .trim();

              teamsMap.set(teamDoc.$id, {
                ...teamDoc,
                userRole: teamDoc.leaderId === userId ? "Leader" : "Member",
                teamName: cleanDisplayName || "Team",
                eventTitle: evt.title,
                minTeamSize: evt.minTeamSize,
                maxTeamSize: evt.maxTeamSize,
                isDisbandRequested,
              });
            } catch {
              // Team document was deleted; skip orphaned invitation
            }
          }
        }
      } catch (inviteErr) {
        console.warn("Error fetching accepted team invitations:", inviteErr);
      }

      // 3. For each team, fetch member roster (Leader + Accepted + Pending Invites)
      const allUsersRes = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.limit(500)],
        )
        .catch(() => ({ documents: [] }));
      const usernameByEmail = buildUsernameByEmailLookup(allUsersRes.documents);

      const teamsList = Array.from(teamsMap.values());
      for (const team of teamsList) {
        try {
          const invites = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teamInvitations,
            [Query.equal("teamId", team.$id), Query.limit(50)],
          );

          const leaderEmail = (team.leaderEmail || "").trim().toLowerCase();
          const leaderUsername =
            usernameByEmail.get(leaderEmail) ||
            (leaderEmail.includes("@")
              ? leaderEmail.split("@")[0]
              : team.leaderName);

          const members: TeamMemberItem[] = [
            {
              name: leaderUsername,
              username: leaderUsername,
              email: team.leaderEmail,
              role: "Leader",
              status: "confirmed",
              userId: team.leaderId,
            },
          ];

          for (const inv of invites.documents) {
            const i = inv as unknown as TeamInvitationDocument;
            if (i.status === "accepted" || i.status === "pending") {
              const memberUsername = resolveInviteeUsername(i, usernameByEmail);
              members.push({
                name: memberUsername,
                username: memberUsername,
                email: i.inviteeEmail,
                role: "Member",
                status: i.status,
                invitationId: i.$id,
              });
            }
          }

          team.members = members;
        } catch {
          // ignore roster fetch error
        }
      }

      return teamsList.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
      );
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.getUserTeams");
    }
  }

  /**
   * List confirmed event registrations for a student.
   * Cross-references event_registrations collection, leader teams, and accepted invitations,
   * auto-repairing / synthesizing any missing registrations.
   */
  async getUserRegistrations(
    userId: string,
    emailOrIdentifiers?: string | string[],
  ): Promise<EventRegistrationDocument[]> {
    try {
      const allEvents = await eventsService.getEvents().catch(() => []);
      const regMap = new Map<string, EventRegistrationDocument>();

      const identifiers = emailOrIdentifiers
        ? Array.isArray(emailOrIdentifiers)
          ? emailOrIdentifiers
          : [emailOrIdentifiers]
        : [];

      const cleanIds = [
        userId,
        ...identifiers.map((id) =>
          typeof id === "string" ? id.trim().toLowerCase() : "",
        ),
      ].filter((id): id is string => Boolean(id && id.length > 0));

      // 1. Check eventRegistrations collection by userId (NO orderDesc to prevent missing-index query failure)
      try {
        const response = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("userId", userId), Query.limit(100)],
        );
        for (const doc of response.documents) {
          regMap.set(doc.eventId, doc as unknown as EventRegistrationDocument);
        }
      } catch (err) {
        console.warn("Error querying registrations by userId:", err);
      }

      // 2. Also check eventRegistrations by user email and identifiers
      for (const id of cleanIds) {
        if (id.includes("@")) {
          try {
            const emailRes = await databases.listDocuments(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.eventRegistrations,
              [Query.equal("userEmail", id), Query.limit(50)],
            );
            for (const doc of emailRes.documents) {
              if (!regMap.has(doc.eventId)) {
                regMap.set(
                  doc.eventId,
                  doc as unknown as EventRegistrationDocument,
                );
              }
            }
          } catch {
            // continue
          }
        } else if (id !== userId) {
          try {
            const idRes = await databases.listDocuments(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.eventRegistrations,
              [Query.equal("userId", id), Query.limit(50)],
            );
            for (const doc of idRes.documents) {
              if (!regMap.has(doc.eventId)) {
                regMap.set(
                  doc.eventId,
                  doc as unknown as EventRegistrationDocument,
                );
              }
            }
          } catch {
            // continue
          }
        }
      }

      // 2.1 Fallback scan: if regMap is still empty, scan recent registrations and match in memory
      if (regMap.size === 0) {
        try {
          const scanRes = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            [Query.limit(100)],
          );
          for (const doc of scanRes.documents) {
            const dUserId = ((doc as any).userId || "").toLowerCase();
            const dEmail = ((doc as any).userEmail || "").toLowerCase();
            const isMatch = cleanIds.some(
              (id) =>
                id === dUserId ||
                id === dEmail ||
                (dEmail.includes("@") && dEmail.split("@")[0] === id) ||
                (id.includes("@") && id.split("@")[0] === dEmail),
            );
            if (isMatch && doc.eventId && !regMap.has(doc.eventId)) {
              regMap.set(
                doc.eventId,
                doc as unknown as EventRegistrationDocument,
              );
            }
          }
        } catch (scanErr) {
          console.warn("Fallback scan for registrations failed:", scanErr);
        }
      }

      // 3. Fallback in-memory synthesis: Check accepted team invitations.
      // If user accepted an invitation but event_registrations row doesn't exist, synthesize pass in-memory (DO NOT MUTATE DB)
      try {
        const acceptedInvites = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [Query.equal("status", "accepted"), Query.limit(100)],
        );

        for (const inv of acceptedInvites.documents) {
          const invData = inv as unknown as TeamInvitationDocument;
          const invEmail = (invData.inviteeEmail || "").trim().toLowerCase();
          const isMatch = cleanIds.some(
            (id) =>
              id === invEmail ||
              (invEmail.includes("@") && invEmail.split("@")[0] === id) ||
              (id.includes("@") && id.split("@")[0] === invEmail),
          );

          if (isMatch && invData.eventId) {
            const matchingEvt = allEvents.find(
              (e) => e.$id === invData.eventId,
            );
            // If the event was deleted, skip this invitation
            if (!matchingEvt) {
              continue;
            }

            if (!regMap.has(invData.eventId)) {
              let teamName = invData.teamName || "Team";
              try {
                const teamDoc = (await databases.getDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teams,
                  invData.teamId,
                )) as any;

                if (
                  teamDoc.status === "cancelled" ||
                  teamDoc.status === "disbanded" ||
                  teamDoc.status === "disqualified"
                ) {
                  continue;
                }
                teamName = teamDoc.name || teamName;
              } catch {
                // Team document was deleted; skip
                continue;
              }

              regMap.set(invData.eventId, {
                $id: `syn-${invData.$id}`,
                $collectionId: APPWRITE_CONFIG.collections.eventRegistrations,
                $databaseId: APPWRITE_CONFIG.databaseId,
                $createdAt: invData.$createdAt || new Date().toISOString(),
                $updatedAt: invData.$updatedAt || new Date().toISOString(),
                $permissions: [],
                eventId: invData.eventId,
                teamId: invData.teamId,
                teamName,
                userId,
                userName:
                  invData.inviteeName || invData.inviteeEmail.split("@")[0],
                userEmail: invData.inviteeEmail,
                registeredAt: invData.$createdAt || new Date().toISOString(),
                eventTitle: matchingEvt.title,
                registrationType: "team",
              } as unknown as EventRegistrationDocument);
            }
          }
        }
      } catch (autoHealErr) {
        console.warn(
          "Error checking accepted invitations for registration sync:",
          autoHealErr,
        );
      }

      // 4. Fallback in-memory synthesis: Check leader teams.
      // If user leads an active team but event_registrations row doesn't exist, synthesize pass in-memory (DO NOT MUTATE DB)
      try {
        const leaderTeamsRes = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          [
            Query.equal("leaderId", userId),
            Query.limit(50),
          ],
        );

        for (const tDoc of leaderTeamsRes.documents) {
          const t = tDoc as unknown as TeamDocument;
          if (
            t.status === "cancelled" ||
            (t.status as any) === "disbanded" ||
            (t.status as any) === "disqualified"
          ) {
            continue;
          }
          if (t.eventId && !regMap.has(t.eventId)) {
            const matchingEvt = allEvents.find((e) => e.$id === t.eventId);
            if (!matchingEvt) {
              // Event was deleted; skip
              continue;
            }

            regMap.set(t.eventId, {
              $id: `syn-${t.$id}`,
              $collectionId: APPWRITE_CONFIG.collections.eventRegistrations,
              $databaseId: APPWRITE_CONFIG.databaseId,
              $createdAt: t.$createdAt || new Date().toISOString(),
              $updatedAt: t.$updatedAt || new Date().toISOString(),
              $permissions: [],
              eventId: t.eventId,
              teamId: t.$id,
              teamName: t.name,
              userId,
              userName: t.leaderName,
              userEmail: t.leaderEmail,
              registeredAt: t.$createdAt || new Date().toISOString(),
              eventTitle: matchingEvt.title,
              registrationType: "team",
            } as unknown as EventRegistrationDocument);
          }
        }
      } catch (leaderHealErr) {
        console.warn(
          "Error checking leader teams for registration sync:",
          leaderHealErr,
        );
      }

      // 5. Enrich all registrations with event title and team name
      const result: EventRegistrationDocument[] = [];
      for (const [_, reg] of regMap) {
        const matchingEvt = allEvents.find((e) => e.$id === reg.eventId);

        let teamName = reg.teamName;
        if (reg.teamId) {
          try {
            const teamDoc = (await databases.getDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.teams,
              reg.teamId,
            )) as any;

            // If the team was cancelled/disbanded, this registration is no longer active
            if (
              teamDoc &&
              (teamDoc.status === "cancelled" ||
                teamDoc.status === "disbanded" ||
                teamDoc.status === "disqualified")
            ) {
              continue;
            }
            if (teamDoc) {
              teamName = teamDoc.name || teamName;
            }
          } catch {
            // Team document lookup failed, continue with existing data
          }
        }

        const resolvedTitle =
          matchingEvt?.title ||
          reg.eventTitle ||
          (reg.eventId === "6a9e4d60000cbccdb36f"
            ? "CLASH OF CODE 2.0"
            : reg.eventId === "6aa40aeb001617df3f25"
              ? "ROBOTRAVERSE"
              : reg.eventId === "6a9e49bc001a4ecd3542"
                ? "Stack Scramble 2.0"
                : reg.eventId === "6a9e4a74000b89971a9f"
                  ? "THE DETECTIVE"
                  : reg.eventId === "6a9e4b2d0000cc64ad18"
                    ? "THE FOUNDER'S PITCH"
                    : reg.eventId === "6a9e4c730027321e366d"
                      ? "FASTEST FINGER FIRST"
                      : reg.eventId === "6a9e4bd800213b95bda6"
                        ? "SURVIVOR"
                        : reg.eventId === "6a9dabac000299f6032d"
                          ? "THE IDEA WALL"
                          : "Registered Event");

        const isSolo =
          (matchingEvt &&
            (matchingEvt.eventType === "solo" ||
              (matchingEvt.minTeamSize || 1) <= 1)) ||
          reg.registrationType === "solo" ||
          (teamName && teamName.includes("(Solo)"));

        result.push({
          ...reg,
          eventTitle: resolvedTitle,
          registrationType: isSolo ? "solo" : "team",
          teamName: isSolo
            ? undefined
            : teamName || (reg.teamId ? "Team Squad" : undefined),
        } as EventRegistrationDocument);
      }

      return result.sort(
        (a, b) =>
          new Date(b.registeredAt).getTime() -
          new Date(a.registeredAt).getTime(),
      );
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.getUserRegistrations");
    }
  }

  /**
   * Check if a user is already enrolled for an event (solo, team leader, or accepted team member)
   */
  async checkUserEventEnrollment(
    eventId: string,
    userId: string,
    identifiers: string[] = [],
  ): Promise<{
    enrolled: boolean;
    reason?: string;
    teamName?: string;
    registrationType?: "solo" | "team";
  }> {
    try {
      const cleanIds = [
        userId,
        ...identifiers.map((id) =>
          typeof id === "string" ? id.trim().toLowerCase() : "",
        ),
      ].filter((id): id is string => Boolean(id && id.length > 0));

      // 1. Check event_registrations
      try {
        const regRes = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("eventId", eventId), Query.limit(100)],
        );

        for (const doc of regRes.documents) {
          const docUserId = ((doc as any).userId || "").toLowerCase();
          const docEmail = ((doc as any).userEmail || "").toLowerCase();
          const isMatch = cleanIds.some(
            (id) =>
              id === docUserId ||
              id === docEmail ||
              (docEmail.includes("@") && docEmail.split("@")[0] === id) ||
              (id.includes("@") && id.split("@")[0] === docEmail),
          );
          if (isMatch) {
            const teamId = (doc as any).teamId;
            if (teamId) {
              // Verify if the referenced team actually exists and is active!
              try {
                const teamDoc = (await databases.getDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teams,
                  teamId,
                )) as any;

                if (
                  !teamDoc ||
                  teamDoc.status === "cancelled" ||
                  teamDoc.status === "disbanded" ||
                  teamDoc.status === "disqualified"
                ) {
                  // Team is cancelled/disbanded! Purge orphaned record and DO NOT treat as enrolled
                  databases
                    .deleteDocument(
                      APPWRITE_CONFIG.databaseId,
                      APPWRITE_CONFIG.collections.eventRegistrations,
                      doc.$id,
                    )
                    .catch(() => {});
                  continue;
                }

                return {
                  enrolled: true,
                  reason: `Enrolled in Team (${teamDoc.name || "Team"})`,
                  teamName: teamDoc.name,
                  registrationType: "team",
                };
              } catch {
                // Team document was deleted from database! Purge orphaned registration and DO NOT treat as enrolled
                databases
                  .deleteDocument(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.collections.eventRegistrations,
                    doc.$id,
                  )
                  .catch(() => {});
                continue;
              }
            }

            return {
              enrolled: true,
              reason: "Solo Registration",
              registrationType: "solo",
            };
          }
        }
      } catch (err) {
        console.warn("Check event_registrations err:", err);
      }

      // 2. Check active teams as leader
      try {
        const teamRes = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          [
            Query.equal("eventId", eventId),
            Query.equal("leaderId", userId),
            Query.limit(20),
          ],
        );
        const activeLeaderTeam = teamRes.documents.find((d: any) => {
          const s = String(d.status || "");
          return s !== "cancelled" && s !== "disbanded" && s !== "disqualified";
        });
        if (activeLeaderTeam) {
          const t = activeLeaderTeam as any;
          return {
            enrolled: true,
            reason: `Team Leader (${t.name || "Team"})`,
            teamName: t.name,
            registrationType: "team",
          };
        }
      } catch (err) {
        console.warn("Check teams err:", err);
      }

      // 3. Check accepted invitations as member
      try {
        const inviteRes = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [
            Query.equal("eventId", eventId),
            Query.equal("status", "accepted"),
            Query.limit(50),
          ],
        );
        for (const inv of inviteRes.documents) {
          const invEmail = ((inv as any).inviteeEmail || "").toLowerCase();
          const isMatch = cleanIds.some(
            (id) =>
              id === invEmail ||
              (invEmail.includes("@") && invEmail.split("@")[0] === id) ||
              (id.includes("@") && id.split("@")[0] === invEmail),
          );
          if (isMatch) {
            const invTeamId = (inv as any).teamId;
            if (invTeamId) {
              try {
                const teamDoc = (await databases.getDocument(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.teams,
                  invTeamId,
                )) as any;

                if (
                  !teamDoc ||
                  teamDoc.status === "cancelled" ||
                  teamDoc.status === "disbanded" ||
                  teamDoc.status === "disqualified"
                ) {
                  continue;
                }

                return {
                  enrolled: true,
                  reason: `Team Member (${teamDoc.name || (inv as any).teamName || "Team"})`,
                  teamName: teamDoc.name || (inv as any).teamName,
                  registrationType: "team",
                };
              } catch {
                continue;
              }
            }

            return {
              enrolled: true,
              reason: `Team Member (${(inv as any).teamName || "Team"})`,
              teamName: (inv as any).teamName,
              registrationType: "team",
            };
          }
        }
      } catch (err) {
        console.warn("Check invitations err:", err);
      }

      return { enrolled: false };
    } catch {
      return { enrolled: false };
    }
  }

  /**
   * Dispatch automated email via Vercel serverless function
   */
  private async dispatchInviteEmail(
    payload: TeamInviteEmailPayload,
  ): Promise<void> {
    try {
      const response = await fetch("/api/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.warn(
          "Invite email API returned an error:",
          response.status,
          errorBody,
        );
      }
    } catch (error) {
      console.warn("Failed to send invite email:", error);
    }
  }

  /**
   * Add a new member to an existing team (Team Leader only)
   */
  async addMemberToTeam(data: {
    teamId: string;
    eventId: string;
    memberHandle: string;
    leaderId: string;
    leaderName: string;
    leaderEmail: string;
  }): Promise<TeamInvitationDocument> {
    try {
      const event = await eventsService.getEventById(data.eventId);
      await eventsService.assertHasCapacity(event);

      const teamDoc = (await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        data.teamId,
      )) as unknown as TeamDocument;

      if (
        teamDoc.status === "cancelled" ||
        (teamDoc.status as any) === "disbanded" ||
        (teamDoc.status as any) === "disqualified"
      ) {
        throw new AppError(
          "This team has been cancelled or disbanded.",
          "UNKNOWN_ERROR",
          400,
        );
      }

      // Check capacity
      const existingInvites = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [Query.equal("teamId", data.teamId), Query.limit(50)],
        )
        .catch(() => ({ documents: [] }));

      const activeInvites = existingInvites.documents.filter(
        (i: any) => i.status === "accepted" || i.status === "pending",
      );

      if (activeInvites.length + 1 >= (event.maxTeamSize || 4)) {
        throw new AppError(
          `Team is already at maximum capacity (${event.maxTeamSize} members).`,
          "TEAM_FULL",
          400,
        );
      }

      // Resolve member handle
      const cleanHandle = data.memberHandle.replace(/^@/, "").trim();
      if (!cleanHandle) {
        throw new AppError(
          "Please enter a valid student email, username, or roll number.",
          "UNKNOWN_ERROR",
          400,
        );
      }

      const allUsersRes = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.limit(500)],
        )
        .catch(() => ({ documents: [] }));

      // Resolve prospective teammate handle, roll number, or email
      const resolved = resolveProspectiveTeammate(
        data.memberHandle,
        allUsersRes.documents,
      );
      const resolvedEmail = resolved.resolvedEmail;
      const inviteeName = resolved.inviteeName;
      const inviteeUserId = resolved.inviteeUserId;

      if (!resolvedEmail || !resolvedEmail.includes("@")) {
        throw new AppError(
          "Invalid email format for prospective teammate.",
          "UNKNOWN_ERROR",
          400,
        );
      }

      if (resolvedEmail === data.leaderEmail.trim().toLowerCase()) {
        throw new AppError(
          "You cannot invite yourself as a teammate.",
          "UNKNOWN_ERROR",
          400,
        );
      }

      // Check if already in this team
      if (
        activeInvites.some(
          (i: any) => (i.inviteeEmail || "").toLowerCase() === resolvedEmail,
        )
      ) {
        throw new AppError(
          `Student is already part of or invited to this team.`,
          "ALREADY_REGISTERED",
          409,
        );
      }

      // Check if already enrolled in this event
      const memberEnrolled = await this.checkUserEventEnrollment(
        data.eventId,
        inviteeUserId || resolvedEmail,
        [resolvedEmail, cleanHandle, inviteeName],
      );
      if (memberEnrolled.enrolled) {
        throw new AppError(
          `Student "${inviteeName || cleanHandle}" is already enrolled in this event (${memberEnrolled.reason || "Existing registration"}).`,
          "ALREADY_REGISTERED",
          409,
        );
      }

      // Check if student has already reached the maximum limit of 3 events
      const memberLookupId = inviteeUserId || resolvedEmail;
      if (memberLookupId) {
        await this.assertWithinRegistrationLimit(
          memberLookupId,
          data.eventId,
          [resolvedEmail, cleanHandle, inviteeName],
          `Student "${inviteeName || cleanHandle}" has already reached the maximum limit of ${MAX_EVENT_REGISTRATIONS_PER_USER} event registrations across Yantrotsav 2026.`,
        );
      }

      const invitePermissions = [
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ];

      const invDoc = await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teamInvitations,
        ID.unique(),
        {
          teamId: data.teamId,
          eventId: data.eventId,
          eventTitle: event.title,
          inviterId: data.leaderId,
          inviterName: data.leaderName.trim(),
          inviteeEmail: resolvedEmail,
          status: "pending",
        },
        invitePermissions,
      );

      const targetDomain =
        APPWRITE_CONFIG.appUrl && !APPWRITE_CONFIG.appUrl.includes("localhost")
          ? APPWRITE_CONFIG.appUrl
          : "https://yantrotsavv10.vercel.app";
      await this.dispatchInviteEmail({
        toEmail: resolvedEmail,
        inviteeName,
        teamName: teamDoc.name || teamDoc.teamName || "Team",
        eventTitle: event.title,
        actionUrl: `${targetDomain}/dashboard?inviteId=${invDoc.$id}`,
      });

      return invDoc as unknown as TeamInvitationDocument;
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.addMemberToTeam");
    }
  }

  /**
   * Cancel an invitation (Pending or Accepted)
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    try {
      try {
        await databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          invitationId,
        );
      } catch {
        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          invitationId,
          { status: "declined" },
        );
      }
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.cancelInvitation");
    }
  }

  /**
   * Remove an accepted member from a team
   */
  async removeTeamMember(
    teamId: string,
    memberEmail: string,
    invitationId?: string,
  ): Promise<void> {
    try {
      const cleanEmail = memberEmail.trim().toLowerCase();

      // 1. Cancel / delete invitation
      if (invitationId) {
        await this.cancelInvitation(invitationId).catch(() => {});
      } else {
        const invs = await databases
          .listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teamInvitations,
            [
              Query.equal("teamId", teamId),
              Query.equal("inviteeEmail", cleanEmail),
            ],
          )
          .catch(() => ({ documents: [] }));
        for (const inv of invs.documents) {
          await this.cancelInvitation(inv.$id).catch(() => {});
        }
      }

      // 2. Remove member's event_registrations row for this team
      const regs = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("teamId", teamId), Query.equal("userEmail", cleanEmail)],
        )
        .catch(() => ({ documents: [] }));
      for (const reg of regs.documents) {
        await databases
          .deleteDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            reg.$id,
          )
          .catch(() => {});
      }

      // 3. Check remaining accepted count; if below minTeamSize, revert to 'pending'
      const teamDoc = (await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        teamId,
      )) as any;

      const acceptedInvites = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [Query.equal("teamId", teamId), Query.equal("status", "accepted")],
        )
        .catch(() => ({ total: 0 }));

      const event = await eventsService
        .getEventById(teamDoc.eventId)
        .catch(() => null);
      const minSize = event?.minTeamSize || 2;
      if (
        acceptedInvites.total + 1 < minSize &&
        teamDoc.status === "confirmed"
      ) {
        await databases
          .updateDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teams,
            teamId,
            { status: "pending" },
          )
          .catch(() => {});
      }
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.removeTeamMember");
    }
  }

  /**
   * Cancel an unconfirmed / pending team immediately (Leader only)
   */
  async cancelPendingTeam(teamId: string, leaderId: string): Promise<void> {
    try {
      const teamDoc = (await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        teamId,
      )) as any;

      if (teamDoc.leaderId !== leaderId) {
        throw new AppError(
          "Only the team leader can cancel this team.",
          "AUTH_UNAUTHORIZED",
          403,
        );
      }

      // 1. Delete all invitations for this team
      const invites = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teamInvitations,
          [Query.equal("teamId", teamId), Query.limit(100)],
        )
        .catch(() => ({ documents: [] }));
      for (const inv of invites.documents) {
        await databases
          .deleteDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.teamInvitations,
            inv.$id,
          )
          .catch(() => {});
      }

      // 2. Delete all registrations for this team (including leader)
      const regs = await databases
        .listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.eventRegistrations,
          [Query.equal("teamId", teamId), Query.limit(100)],
        )
        .catch(() => ({ documents: [] }));
      for (const reg of regs.documents) {
        await databases
          .deleteDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.eventRegistrations,
            reg.$id,
          )
          .catch(() => {});
      }

      // 3. Mark team status as cancelled or delete document
      try {
        await databases.deleteDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          teamId,
        );
      } catch {
        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          teamId,
          { status: "cancelled" },
        );
      }
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.cancelPendingTeam");
    }
  }

  /**
   * Request disbandment of a confirmed team (Pending Admin Approval)
   */
  async requestTeamDisband(
    teamId: string,
    leaderId: string,
    reason: string,
    leaderPhone?: string,
  ): Promise<void> {
    try {
      const teamDoc = (await databases.getDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.collections.teams,
        teamId,
      )) as any;

      if (teamDoc.leaderId !== leaderId) {
        throw new AppError(
          "Only the team leader can submit a disband request.",
          "AUTH_UNAUTHORIZED",
          403,
        );
      }

      const currentName = teamDoc.name || teamDoc.teamName || "Team";
      if (!currentName.includes("[DISBAND REQUESTED]")) {
        const newName = `[DISBAND REQUESTED] ${currentName}`.slice(0, 100);
        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.teams,
          teamId,
          { name: newName },
        );
      }

      // Resolve leader phone / WhatsApp number from argument or profile collection
      let resolvedPhone = (leaderPhone || "").trim();
      if (!resolvedPhone) {
        try {
          const userDoc = (await databases
            .getDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.users,
              leaderId,
            )
            .catch(() => null)) as any;
          if (userDoc?.phone) {
            resolvedPhone = String(userDoc.phone).trim();
          } else if (teamDoc.leaderEmail) {
            const listRes = await databases
              .listDocuments(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.users,
                [Query.equal("email", teamDoc.leaderEmail), Query.limit(1)],
              )
              .catch(() => ({ documents: [] }));
            if (
              listRes.documents.length > 0 &&
              (listRes.documents[0] as any).phone
            ) {
              resolvedPhone = String(
                (listRes.documents[0] as any).phone,
              ).trim();
            }
          }
        } catch {
          // ignore
        }
      }

      // Dispatch disband notification email to admin/organizers
      try {
        await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: teamDoc.leaderName || "Team Leader",
            email: teamDoc.leaderEmail,
            phone: resolvedPhone || "Not provided",
            queryType: "TEAM DISBAND REQUEST",
            message: `TEAM DISBAND REQUEST FOR YANTROTSAV\n\nTeam: ${currentName} (ID: ${teamId})\nLeader: ${teamDoc.leaderName} (${teamDoc.leaderEmail})\nWhatsApp / Phone: ${resolvedPhone || "Not provided"}\nReason: ${reason || "Leader requested team disbandment."}\n\nPlease review and approve this disband request in the Admin Dashboard.`,
          }),
        });
      } catch {
        // Continue even if notification encounters network error
      }
    } catch (error) {
      throw mapAppwriteError(error, "TeamsService.requestTeamDisband");
    }
  }
}

export const teamsService = new TeamsService();
