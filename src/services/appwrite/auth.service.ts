import { ID, Permission, Role, Query } from "appwrite";
import { account, teams, databases } from "./client";
import { APPWRITE_CONFIG } from "../../config/appwrite.config";
import { mapAppwriteError, AppError } from "./errorMapper";
import type { Models } from "appwrite";
import type { UserProfile, RegisterPayload } from "../../types/database.types";
import { getUsernameError, normalizeUsername } from "../../utils/username";
import {
  getContactError,
  normalizeEmail,
  normalizeMobile,
} from "../../utils/profileValidation";

export class AuthService {
  /**
   * Register a new student account and create database profile in `users` collection
   * under `TablesDB` via client SDK.
   */
  async registerStudent(payload: RegisterPayload): Promise<{
    account: Models.User<Models.Preferences>;
    userProfile: UserProfile;
  }> {
    throw new AppError(
      "Online registrations are officially closed. No further registrations will be accepted. For any queries, please contact the organizing team.",
      "EVENT_REGISTRATION_CLOSED",
      403,
    );
    // 0. Strict validation: Sab kuch sahi hone ke baad hi account & DB row create karenge
    const fullName = payload.fullName?.trim() || "";
    const email = normalizeEmail(payload.email || "");
    const password = payload.password || "";
    const rollNumber = payload.rollNumber?.trim() || "";
    const phone = normalizeMobile(payload.phone || "");
    const department = payload.department?.trim() || "";
    const semester = payload.semester?.trim() || "";
    const username = normalizeUsername(payload.username || "");
    const normalizedPayload: RegisterPayload = {
      ...payload,
      fullName,
      email,
      phone,
      username,
      rollNumber,
      department,
      semester,
    };

    if (!fullName)
      throw new AppError("Full Name is required.", "UNKNOWN_ERROR", 400);
    if (!email) throw new AppError("Email is required.", "UNKNOWN_ERROR", 400);
    if (!password || password.length < 8) {
      throw new AppError(
        "Password must be at least 8 characters long.",
        "UNKNOWN_ERROR",
        400,
      );
    }
    if (!rollNumber)
      throw new AppError("Roll Number is required.", "UNKNOWN_ERROR", 400);
    if (!department)
      throw new AppError("Department is required.", "UNKNOWN_ERROR", 400);
    const contactError = getContactError(email, phone);
    if (contactError) throw new AppError(contactError!, "UNKNOWN_ERROR", 400);
    const usernameError = getUsernameError(username);
    if (usernameError) throw new AppError(usernameError!, "UNKNOWN_ERROR", 400);

    return this.registerStudentWithSdk(normalizedPayload);
  }

  private async registerStudentWithSdk(payload: RegisterPayload): Promise<{
    account: Models.User<Models.Preferences>;
    userProfile: UserProfile;
  }> {
    const fullName = payload.fullName?.trim() || "";
    const email = normalizeEmail(payload.email || "");
    const password = payload.password || "";
    const rollNumber = payload.rollNumber?.trim() || "";
    const phone = normalizeMobile(payload.phone || "");
    const department = payload.department?.trim() || "";
    const semester = payload.semester?.trim() || "";
    const username = normalizeUsername(payload.username || "");

    try {
      // 0. Pre-validate uniqueness in Database BEFORE touching Auth
      // This guarantees no orphan Auth accounts or sessions are created if a field is already taken
      const [existingUsername, existingRoll, existingEmail] = await Promise.all([
        databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.equal("userId", username), Query.limit(1)],
        ),
        databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.equal("rollNumber", rollNumber), Query.limit(1)],
        ),
        databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.equal("email", email), Query.limit(1)],
        ),
      ]);

      if (existingUsername.documents.length) {
        throw new AppError(
          "This username is already taken. Please choose another one.",
          "ALREADY_REGISTERED",
          409,
        );
      }

      if (existingRoll.documents.length) {
        throw new AppError(
          "A student with this Roll Number is already registered.",
          "ALREADY_REGISTERED",
          409,
        );
      }

      if (existingEmail.documents.length) {
        throw new AppError(
          "An account with this email address already exists. Try signing in.",
          "ALREADY_REGISTERED",
          409,
        );
      }

      // 1. Generate primary auth user or recover existing auth user if table profile was deleted
      let authUser: Models.User<Models.Preferences>;
      let isExistingAuthUser = false;

      try {
        authUser = await account.create(ID.unique(), email, password, fullName);
      } catch (authErr: any) {
        const errType = authErr?.type || "";
        const errMsg = authErr?.message?.toLowerCase() || "";
        if (
          errType === "user_already_exists" ||
          errMsg.includes("already exists") ||
          !navigator.onLine ||
          !errType
        ) {
          // A slow connection can lose the response after Appwrite has already created the account.
          // Signing in verifies that case and lets us finish the missing profile instead of creating a partial account.
          try {
            await account.createEmailPasswordSession(email, password);
            const currentAcc = await account.get();
            const existingDoc = await databases
              .getDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.users,
                currentAcc.$id,
              )
              .catch(() => null);

            if (!existingDoc) {
              // The user account exists in Appwrite Auth, but their database table document was deleted!
              // Seamlessly recreate their profile in the database table and finish registration.
              authUser = currentAcc;
              isExistingAuthUser = true;
            } else {
              await account.deleteSession("current").catch(() => {});
              throw authErr;
            }
          } catch (sessionErr: any) {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      // 2. If new auth user, sign in to establish active session token
      if (!isExistingAuthUser) {
        await account.createEmailPasswordSession(email, password);
      }

      // Save username in account preferences if provided
      if (username) {
        try {
          await account.updatePrefs({ username });
        } catch (prefErr) {
          console.warn("Could not save username in prefs:", prefErr);
        }
      }

      // 3. Write student profile document using authUser.$id as Document ID,
      // and put chosen username into the existing `userId` DB field
      const chosenUserId = username;
      const profileData: Record<string, any> = {
        userId: chosenUserId.slice(0, 128),
        fullName: fullName.slice(0, 128),
        email: email.slice(0, 128),
        phone: phone.slice(0, 32),
        semester: semester.slice(0, 32),
        rollNumber: rollNumber.slice(0, 128),
        department,
      };

      if (payload.customDepartment?.trim()) {
        profileData.customDepartment = payload.customDepartment
          .trim()
          .slice(0, 128);
      }

      const docPermissions = [
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ];

      const createProfileDocument = () =>
        databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          authUser.$id,
          profileData,
          docPermissions,
        );

      let profileDoc: UserProfile;
      try {
        const doc = await createProfileDocument();
        profileDoc = doc as unknown as UserProfile;
      } catch (docError: any) {
        // A request can time out after Appwrite commits the document. Read it before retrying,
        // making profile provisioning idempotent instead of reporting a false failure.
        if (
          docError?.code === 409 ||
          docError?.type === "document_already_exists"
        ) {
          const existing = await databases.getDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            authUser.$id,
          );
          profileDoc = existing as unknown as UserProfile;
        } else {
          const errMsg = docError?.message?.toLowerCase() || "";
          if (errMsg.includes("customdepartment") || docError?.code === 400) {
            if ("customDepartment" in profileData) {
              delete profileData.customDepartment;
            }
            try {
              const doc = await createProfileDocument();
              profileDoc = doc as unknown as UserProfile;
            } catch (retryError) {
              throw mapAppwriteError(
                retryError,
                "AuthService.registerStudent (createDocument)",
              );
            }
          } else {
            throw mapAppwriteError(
              docError,
              "AuthService.registerStudent (createDocument)",
            );
          }
        }
      }

      return {
        account: authUser,
        userProfile: profileDoc,
      };
    } catch (error) {
      // If registration failed after session was established, wipe active session so no half-baked state remains
      await account.deleteSession("current").catch(() => {});
      throw mapAppwriteError(error, "AuthService.registerStudent");
    }
  }

  /**
   * Backward-compatible register method
   */
  async register(params: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    rollNo?: string;
    college?: string;
    branch?: string;
    semester?: string;
  }): Promise<Models.User<Models.Preferences>> {
    const result = await this.registerStudent({
      fullName: params.name,
      email: params.email,
      password: params.password,
      rollNumber: params.rollNo || "",
      phone: params.phone || "",
      department: params.branch || "",
      semester: params.semester || "",
    });
    return result.account;
  }

  /**
   * Log in with Email, Username, or Roll Number & Password
   */
  async login(identifier: string, password: string): Promise<Models.Session> {
    throw new AppError(
      "Online registrations and portal access are officially closed. For any queries, please contact the organizing team.",
      "AUTH_UNAUTHORIZED",
      403,
    );
    try {
      // Clear any previous or lingering active session first
      try {
        await account.deleteSession("current");
      } catch {
        // Safe to ignore if no session was active
      }

      let emailToUse = identifier.trim();
      const isRealEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse);

      // If user did not provide a well-formed email, treat identifier as Username or Roll Number
      if (!isRealEmail) {
        const cleanHandle = emailToUse.toLowerCase().replace(/^@/, "");
        const cleanRoll = emailToUse.toUpperCase();
        try {
          // 1. Check by userId (which stores username)
          const userDocQuery = await databases
            .listDocuments(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.users,
              [Query.equal("userId", cleanHandle), Query.limit(1)],
            )
            .catch(() => ({ documents: [] }));

          if (userDocQuery.documents.length > 0) {
            emailToUse = (userDocQuery.documents[0] as any).email;
          } else {
            // 2. Check by rollNumber
            const rollQuery = await databases
              .listDocuments(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.users,
                [Query.equal("rollNumber", cleanRoll), Query.limit(1)],
              )
              .catch(() => ({ documents: [] }));

            if (rollQuery.documents.length > 0) {
              emailToUse = (rollQuery.documents[0] as any).email;
            } else {
              // 3. Fallback: Search all recent users case-insensitively
              const allUsers = await databases
                .listDocuments(
                  APPWRITE_CONFIG.databaseId,
                  APPWRITE_CONFIG.collections.users,
                  [Query.limit(100)],
                )
                .catch(() => ({ documents: [] }));

              const matched = allUsers.documents.find((u: any) => {
                const uId = (u.userId || "").toLowerCase().replace(/^@/, "");
                const uRoll = (u.rollNumber || "").toUpperCase();
                return (
                  uId === cleanHandle ||
                  uRoll === cleanRoll ||
                  (u.rollNumber || "").toLowerCase() === cleanHandle
                );
              });

              if (matched && (matched as any).email) {
                emailToUse = (matched as any).email;
              } else {
                // Determine user-friendly specific message based on input format
                const hasRollPattern = /\d/.test(identifier);
                if (hasRollPattern) {
                  throw new AppError(
                    `No student registered with Roll Number "${identifier}". Please verify your roll number or log in with your email address.`,
                    "AUTH_INVALID_CREDENTIALS",
                    404,
                  );
                } else if (
                  identifier.startsWith("@") ||
                  !identifier.includes("@")
                ) {
                  throw new AppError(
                    `No student registered with Username "${identifier}". Please check your username or log in with your email address.`,
                    "AUTH_INVALID_CREDENTIALS",
                    404,
                  );
                } else {
                  throw new AppError(
                    `"${identifier}" is not a valid email, username, or roll number. Please enter a valid email address (e.g. name@example.com).`,
                    "AUTH_INVALID_CREDENTIALS",
                    400,
                  );
                }
              }
            }
          }
        } catch (lookupErr: any) {
          if (lookupErr instanceof AppError) throw lookupErr;
          // Fall back to direct login attempt
        }
      }

      try {
        return await account.createEmailPasswordSession(emailToUse, password);
      } catch (sessionErr: any) {
        const errCode = sessionErr?.code || sessionErr?.status;
        const errMsg = sessionErr?.message || "";
        if (
          errCode === 401 ||
          errMsg.toLowerCase().includes("invalid credentials")
        ) {
          throw new AppError(
            "Invalid credentials. The password entered is incorrect for this account.",
            "AUTH_INVALID_CREDENTIALS",
            401,
            sessionErr,
          );
        }
        if (errCode === 400 && errMsg.toLowerCase().includes("email")) {
          throw new AppError(
            `"${identifier}" was not recognized as a registered student account. Please check your roll number, username, or email.`,
            "AUTH_INVALID_CREDENTIALS",
            400,
            sessionErr,
          );
        }
        throw sessionErr;
      }
    } catch (error) {
      throw mapAppwriteError(error, "AuthService.login");
    }
  }

  /**
   * Update student profile in `users` collection and Appwrite auth account
   */
  async updateProfile(
    userId: string,
    data: Partial<UserProfile>,
  ): Promise<UserProfile> {
    try {
      const updateData: Record<string, any> = {};
      const requestedUsername =
        data.username !== undefined
          ? normalizeUsername(data.username)
          : data.userId !== undefined
            ? normalizeUsername(data.userId)
            : undefined;

      // Get current auth user details to verify ownership and assist with recovery/upsert
      const authUser = await account.get().catch(() => null);

      if (requestedUsername !== undefined) {
        const usernameError = getUsernameError(requestedUsername);
        if (usernameError)
          throw new AppError(usernameError, "UNKNOWN_ERROR", 400);
        const matches = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          [Query.equal("userId", requestedUsername), Query.limit(2)],
        );
        if (
          matches.documents.some(
            (document) =>
              document.$id !== userId &&
              (!authUser || (document as any).email !== authUser.email),
          )
        ) {
          throw new AppError(
            "This username is already taken. Please choose another one.",
            "ALREADY_REGISTERED",
            409,
          );
        }
      }

      if (data.fullName !== undefined)
        updateData.fullName = data.fullName.trim().slice(0, 128);
      if (data.phone !== undefined)
        updateData.phone = data.phone.trim().slice(0, 32);
      if (data.department !== undefined)
        updateData.department = data.department.trim();
      if (data.customDepartment !== undefined)
        updateData.customDepartment = data.customDepartment
          .trim()
          .slice(0, 128);
      if (data.semester !== undefined)
        updateData.semester = data.semester.trim().slice(0, 32);
      if (data.rollNumber !== undefined)
        updateData.rollNumber = data.rollNumber.trim().slice(0, 128);
      if (requestedUsername !== undefined) {
        updateData.userId = requestedUsername;
      }

      // 2. Update database document in users collection with intelligent auto-heal / upsert
      let updatedDoc: any;
      let targetDocId = userId;

      try {
        updatedDoc = await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          targetDocId,
          updateData,
        );
      } catch (updateErr: any) {
        const isNotFound =
          updateErr?.code === 404 ||
          updateErr?.type === "document_not_found" ||
          updateErr?.message?.toLowerCase().includes("not found");

        if (!isNotFound) {
          throw updateErr;
        }

        // Auto-heal fallback: If document was deleted from table or has a different doc ID
        let existingDoc: any = null;
        if (authUser?.email) {
          try {
            const emailSearch = await databases.listDocuments(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.users,
              [Query.equal("email", authUser.email), Query.limit(1)],
            );
            if (emailSearch.documents.length > 0) {
              existingDoc = emailSearch.documents[0];
            }
          } catch {
            // Ignore search error
          }
        }

        if (existingDoc) {
          targetDocId = existingDoc.$id;
          updatedDoc = await databases.updateDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            targetDocId,
            updateData,
          );
        } else {
          // Document was wiped or deleted from database: Recreate it immediately!
          const chosenHandle =
            requestedUsername ||
            (authUser?.prefs as any)?.username ||
            (authUser?.name
              ? authUser.name.toLowerCase().replace(/[^a-z0-9._]/g, "")
              : "") ||
            authUser?.email?.split("@")[0] ||
            userId;

          const createPayload: Record<string, any> = {
            userId: chosenHandle.slice(0, 128),
            fullName: (
              data.fullName?.trim() ||
              authUser?.name ||
              chosenHandle
            ).slice(0, 128),
            email: authUser?.email || "",
            phone: (data.phone?.trim() || authUser?.phone || "").slice(0, 32),
            department: data.department?.trim() || "",
            semester: data.semester?.trim() || "",
            rollNumber: (data.rollNumber?.trim() || "").slice(0, 128),
            ...updateData,
          };

          if (data.customDepartment?.trim()) {
            createPayload.customDepartment = data.customDepartment
              .trim()
              .slice(0, 128);
          }

          const docPermissions = [
            Permission.read(Role.any()),
            Permission.update(Role.any()),
            Permission.delete(Role.any()),
          ];

          try {
            updatedDoc = await databases.createDocument(
              APPWRITE_CONFIG.databaseId,
              APPWRITE_CONFIG.collections.users,
              targetDocId,
              createPayload,
              docPermissions,
            );
          } catch (createErr: any) {
            const errMsg = createErr?.message?.toLowerCase() || "";
            if (
              errMsg.includes("customdepartment") ||
              createErr?.code === 400
            ) {
              delete createPayload.customDepartment;
              updatedDoc = await databases.createDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.users,
                targetDocId,
                createPayload,
                docPermissions,
              );
            } else if (
              createErr?.code === 409 ||
              createErr?.type === "document_already_exists"
            ) {
              updatedDoc = await databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.collections.users,
                targetDocId,
                updateData,
              );
            } else {
              throw createErr;
            }
          }
        }
      }

      // 3. If full name was modified, synchronize with Appwrite Auth User name
      if (data.fullName?.trim()) {
        try {
          await account.updateName(data.fullName.trim());
        } catch {
          // ignore auth name update failure if session is read-only
        }
      }

      // 4. If username was provided, synchronize with Appwrite Auth User preferences
      const chosenUserHandle = requestedUsername;
      if (chosenUserHandle !== undefined) {
        try {
          const authUserObj = await account.get();
          await account.updatePrefs({
            ...(authUserObj.prefs || {}),
            username: chosenUserHandle,
          });
        } catch (prefErr) {
          console.warn("Could not update username in prefs:", prefErr);
        }
      }

      const userProfile = updatedDoc as unknown as UserProfile;
      if (chosenUserHandle !== undefined) {
        userProfile.username = chosenUserHandle;
        userProfile.userId = chosenUserHandle;
      }
      return userProfile;
    } catch (error) {
      throw mapAppwriteError(error, "AuthService.updateProfile");
    }
  }

  /**
   * Terminate current active session
   */
  async logout(): Promise<void> {
    try {
      await account.deleteSession("current");
    } catch (error) {
      throw mapAppwriteError(error, "AuthService.logout");
    }
  }

  /**
   * Fetch current authenticated account object from Appwrite
   */
  async getCurrentUser(): Promise<Models.User<Models.Preferences> | null> {
    try {
      return await account.get();
    } catch {
      return null;
    }
  }

  /**
   * Retrieve extended student profile from `users` collection in `yantrotsav_db`
   *
   * Steps:
   * 1. account.get()
   * 2. databases.getDocument(databaseId, 'users', user.$id)
   */
  async getCurrentUserProfile(): Promise<UserProfile | null> {
    try {
      const authUser = await account.get();
      if (!authUser) return null;

      const loadDocument = async () => {
        try {
          return await databases.getDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            authUser.$id,
          );
        } catch {
          return null;
        }
      };

      let doc = await loadDocument();

      // If document was not found by authUser.$id, check if it exists under email
      if (!doc && authUser.email) {
        try {
          const byEmail = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            [Query.equal("email", authUser.email), Query.limit(1)],
          );
          if (byEmail.documents.length > 0) {
            doc = byEmail.documents[0];
          }
        } catch {
          // Ignore
        }
      }

      // If document was deleted from database, self-heal automatically!
      if (!doc) {
        try {
          const initialHandle =
            (authUser.prefs as any)?.username ||
            (authUser.name
              ? authUser.name.toLowerCase().replace(/[^a-z0-9._]/g, "")
              : "") ||
            authUser.email.split("@")[0];

          doc = await databases.createDocument(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            authUser.$id,
            {
              userId: initialHandle.slice(0, 128),
              fullName: (authUser.name || initialHandle).slice(0, 128),
              email: authUser.email.slice(0, 128),
              phone: (authUser.phone || "").slice(0, 32),
              semester: "",
              rollNumber: "",
              department: "",
            },
            [
              Permission.read(Role.any()),
              Permission.update(Role.any()),
              Permission.delete(Role.any()),
            ],
          );
        } catch (healErr) {
          console.warn(
            "[AuthService.getCurrentUserProfile] Auto-heal notice:",
            healErr,
          );
        }
      }

      if (!doc) return null;

      const profile = doc as unknown as UserProfile;
      if (profile.userId) {
        profile.username = profile.userId;
      } else if ((authUser.prefs as any)?.username && !profile.username) {
        profile.username = (authUser.prefs as any).username;
      }
      return profile;
    } catch {
      return null;
    }
  }

  /**
   * Fetch current authenticated session
   */
  async getSession(): Promise<Models.Session | null> {
    try {
      return await account.getSession("current");
    } catch {
      return null;
    }
  }

  /**
   * Check if current user has Admin privileges
   * Evaluates user.labels ('admin') or Appwrite Team membership
   */
  async checkIsAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return false;

      // Check Appwrite user labels
      if (Array.isArray(user.labels) && user.labels.includes("admin")) {
        return true;
      }

      // Check Appwrite Admin Team membership if configured
      if (
        APPWRITE_CONFIG.adminTeamId &&
        APPWRITE_CONFIG.adminTeamId !== "placeholder_admin_team_id"
      ) {
        try {
          const userTeams = await teams.list();
          const isAdminTeamMember = userTeams.teams.some(
            (team) => team.$id === APPWRITE_CONFIG.adminTeamId,
          );
          if (isAdminTeamMember) return true;
        } catch {
          // Ignore team lookup failure and fall back
        }
      }

      return false;
    } catch (error) {
      console.warn("Admin check warning:", error);
      return false;
    }
  }

  /**
   * Fetch user profile from database by userId, email, or rollNumber
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    try {
      try {
        const doc = await databases.getDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.collections.users,
          userId,
        );
        return doc as unknown as UserProfile;
      } catch (err: any) {
        const isNotFound =
          err?.code === 404 ||
          err?.type === "document_not_found" ||
          err?.message?.toLowerCase().includes("not found");
        if (!isNotFound) throw err;
      }

      // If not found by primary document ID, query by userId, email, or rollNumber
      const queries = [
        [Query.equal("userId", userId), Query.limit(1)],
        [Query.equal("email", userId), Query.limit(1)],
        [Query.equal("rollNumber", userId), Query.limit(1)],
      ];

      for (const q of queries) {
        try {
          const res = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.users,
            q,
          );
          if (res.documents.length > 0) {
            return res.documents[0] as unknown as UserProfile;
          }
        } catch {
          // Continue to next query
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
