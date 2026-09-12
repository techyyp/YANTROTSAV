import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar,
  Users,
  Mail,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lock,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Edit3,
  X,
  AtSign,
  UserPlus,
  Trash2,
  GraduationCap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  teamsService,
  type UserTeamInfo,
  type TeamMemberItem,
} from '../services/appwrite/teams.service'
import { client } from '../services/appwrite/client'
import { APPWRITE_CONFIG } from '../config/appwrite.config'
import { DEPARTMENT_OPTIONS, SEMESTER_OPTIONS } from '../types/database.types'
import type {
  TeamInvitationDocument,
  EventRegistrationDocument,
} from '../types/database.types'
import { showToast } from '../utils/toast'

export default function Dashboard() {
   useEffect(() => {
    document.title = 'YANTROTSAV | Dashboard'
  }, [])
  const { user, profile, loading: authLoading, updateProfile } = useAuth()

  const [invitations, setInvitations] = useState<TeamInvitationDocument[]>([])
  const [registrations, setRegistrations] = useState<EventRegistrationDocument[]>([])
  const [userTeams, setUserTeams] = useState<UserTeamInfo[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Team Management Modals State
  const [addMemberModalTeam, setAddMemberModalTeam] = useState<UserTeamInfo | null>(null)
  const [addMemberInput, setAddMemberInput] = useState('')
  const [isSubmittingAddMember, setIsSubmittingAddMember] = useState(false)

  const [disbandModalTeam, setDisbandModalTeam] = useState<UserTeamInfo | null>(null)
  const [disbandReason, setDisbandReason] = useState('')
  const [isSubmittingDisband, setIsSubmittingDisband] = useState(false)

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [editFormData, setEditFormData] = useState({
    fullName: '',
    username: '',
    phone: '',
    rollNumber: '',
    department: 'CSE',
    customDepartment: '',
    semester: 'Semester 4',
  })

  const loadStudentData = useCallback(async () => {
    if (!user) return
    setLoadingData(true)
    try {
      // Gather all potential identifiers to match invitations (userId from DB, email, handle, roll number)
      const userIdentifiers = [
        profile?.userId,
        user.email,
        user.email.split('@')[0],
        (user.prefs as Record<string, any>)?.username,
        profile?.username,
        profile?.rollNumber,
        profile?.rollNo,
      ].filter(Boolean) as string[]

      const [invites, regs, teams] = await Promise.all([
        teamsService.getUserInvitations(userIdentifiers),
        teamsService.getUserRegistrations(user.$id, userIdentifiers),
        teamsService.getUserTeams(user.$id, userIdentifiers),
      ])

      // Sanitize: ensure no cancelled teams or solo mirror entries leak into My Teams squad list
      const validRegs = regs.filter((r) => Boolean(r.eventId))
      const validTeams = teams.filter(
        (t) =>
          t.status !== 'cancelled' &&
          (t.status as any) !== 'disbanded' &&
          Boolean(t.eventId) &&
          !t.name?.includes('(Solo)'),
      )

      setInvitations(invites)
      setRegistrations(validRegs)
      setUserTeams(validTeams)

      // Check if student arrived from an email invitation link (?inviteId=...)
      const searchParams = new URLSearchParams(window.location.search)
      const queryInviteId = searchParams.get('inviteId')
      if (queryInviteId) {
        const found = invites.find((i) => i.$id === queryInviteId)
        if (found) {
          showToast.success(`Squad invitation found for "${found.eventTitle || 'Event'}"! Review and accept below.`)
        } else {
          showToast.error(
            'This squad invitation was revoked or cancelled by the team leader, or the squad is no longer active.',
          )
        }
        // Clean URL to prevent repeated feedback on manual reload
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    } catch (err) {
      console.error('Error fetching dashboard records:', err)
    } finally {
      setLoadingData(false)
    }
  }, [user, profile])

  useEffect(() => {
    if (user) {
      loadStudentData()
    }
  }, [user, loadStudentData])

  // Appwrite Realtime WebSocket Subscription (Live Events Emission)
  useEffect(() => {
    if (!user) return

    const invitationChannel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.teamInvitations}.documents`
    const teamChannel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.teams}.documents`
    const regChannel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.eventRegistrations}.documents`

    const userIdentifiers = [
      (profile?.userId || '').toLowerCase(),
      user.email.toLowerCase(),
      user.email.split('@')[0].toLowerCase(),
      ((user.prefs as Record<string, any>)?.username || '').toLowerCase(),
      (profile?.username || '').toLowerCase(),
      (profile?.rollNumber || '').toLowerCase(),
      (profile?.rollNo || '').toLowerCase(),
    ].filter(Boolean) as string[]

    const unsubscribe = client.subscribe([invitationChannel, teamChannel, regChannel], (response) => {
      // Auto-refresh student dashboard data
      loadStudentData()

      // Handle team invitation live event
      if (response.events.some((ev) => ev.includes('.collections.team_invitations.'))) {
        const payload = response.payload as TeamInvitationDocument
        const target = (payload.inviteeEmail || '').toLowerCase()
        const isTargetMatch = userIdentifiers.some(
          (id) =>
            target === id ||
            (target.includes('@') && target.split('@')[0] === id) ||
            (id.includes('@') && id.split('@')[0] === target),
        )

        if (isTargetMatch) {
          const isCreate = response.events.some((ev) => ev.endsWith('.create'))
          if (isCreate && payload.status === 'pending') {
            showToast.info(
              `⚡ Squad invitation received from ${payload.inviterName || 'a teammate'} for "${payload.eventTitle || 'Event'}"! Review below.`,
              { autoClose: 6000 }
            )
          }
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [user, profile, loadStudentData])

  // Pre-fill edit modal when opened
  const handleOpenEditModal = () => {
    const userPrefs = (user?.prefs as Record<string, any>) || {}
    // Extract numeric semester or default to '4'
    const rawSem = profile?.semester || ''
    const match = rawSem.match(/\d+/)
    const normSem = match && parseInt(match[0], 10) >= 1 && parseInt(match[0], 10) <= 8 ? match[0] : (rawSem || '4')

    setEditFormData({
      fullName: profile?.fullName || profile?.name || user?.name || '',
      username: profile?.username || userPrefs.username || user?.email?.split('@')[0] || '',
      phone: profile?.phone || '',
      rollNumber: profile?.rollNumber || profile?.rollNo || '',
      department: profile?.department || profile?.branch || 'CSE',
      customDepartment: profile?.customDepartment || '',
      semester: normSem,
    })
    setIsEditModalOpen(true)
  }

  const handleSaveProfileSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSavingProfile(true)
    try {
      if (editFormData.semester.trim()) {
        const semNum = parseInt(editFormData.semester, 10)
        if (isNaN(semNum) || semNum < 1 || semNum > 8) {
          throw new Error('Semester must be between 1 and 8.')
        }
      }
      await updateProfile({
        fullName: editFormData.fullName.trim(),
        username: editFormData.username.trim(),
        phone: editFormData.phone.trim(),
        rollNumber: editFormData.rollNumber.trim(),
        department: editFormData.department.trim(),
        customDepartment: editFormData.department === 'OTHER' ? editFormData.customDepartment.trim() : undefined,
        semester: editFormData.semester.trim(),
      })
      setIsEditModalOpen(false)
    } catch (err: unknown) {
      showToast.error(err instanceof Error ? err.message : 'Failed to update profile.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleInvitationResponse = async (
    invitationId: string,
    response: 'accepted' | 'declined',
  ) => {
    if (!user) return
    setActionLoading(invitationId)

    try {
      await teamsService.respondToInvitation({
        invitationId,
        response,
        student: {
          userId: user.$id,
          name: user.name,
          email: user.email,
          phone: profile?.phone,
          rollNo: profile?.rollNumber || profile?.rollNo,
          college: profile?.college,
        },
      })

      showToast.success(
        `Invitation ${response === 'accepted' ? 'accepted! Your squad roster has been updated.' : 'declined.'}`,
      )

      await loadStudentData()
    } catch (err: unknown) {
      showToast.error(err instanceof Error ? err.message : 'Failed to update invitation status.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveMemberOrInvite = async (team: UserTeamInfo, member: TeamMemberItem) => {
    if (member.status === 'pending') {
      if (!window.confirm(`Cancel pending invitation for ${member.name}?`)) return
      if (!member.invitationId) return
      const actionKey = `${team.$id}-${member.invitationId}`
      setActionLoading(actionKey)
      try {
        await teamsService.cancelInvitation(member.invitationId)
        showToast.success(`Invitation for ${member.name} cancelled.`)
        await loadStudentData()
      } catch (err: unknown) {
        showToast.error(err instanceof Error ? err.message : 'Failed to cancel invitation')
      } finally {
        setActionLoading(null)
      }
    } else {
      const displayName = team.name || team.teamName || 'the squad'
      if (
        !window.confirm(
          `Are you sure you want to remove ${member.name} from "${displayName}"? Their registration for this event will be cancelled.`,
        )
      )
        return
      const actionKey = `${team.$id}-${member.invitationId || member.email}`
      setActionLoading(actionKey)
      try {
        await teamsService.removeTeamMember(team.$id, member.email, member.invitationId)
        showToast.success(`${member.name} removed from the squad.`)
        await loadStudentData()
      } catch (err: unknown) {
        showToast.error(err instanceof Error ? err.message : 'Failed to remove member')
      } finally {
        setActionLoading(null)
      }
    }
  }

  const handleCancelPendingTeam = async (team: UserTeamInfo) => {
    if (!user) return
    const displayName = team.name || team.teamName || 'squad'
    if (!window.confirm(`Cancel squad "${displayName}"? All pending invitations will be revoked.`))
      return
    setActionLoading(team.$id)
    try {
      await teamsService.cancelPendingTeam(team.$id, user.$id)
      showToast.success(`Squad "${displayName}" cancelled successfully.`)
      await loadStudentData()
    } catch (err: unknown) {
      showToast.error(err instanceof Error ? err.message : 'Failed to cancel squad')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendAddMemberInvite = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !addMemberModalTeam) return
    const input = addMemberInput.trim()
    if (!input) {
      showToast.warning('Please enter a username, email, or roll number.')
      return
    }
    setIsSubmittingAddMember(true)
    try {
      await teamsService.addMemberToTeam({
        teamId: addMemberModalTeam.$id,
        eventId: addMemberModalTeam.eventId,
        memberHandle: input,
        leaderId: user.$id,
        leaderName: profile?.fullName || user.name || 'Team Leader',
        leaderEmail: user.email,
      })
      showToast.success(`Invitation successfully sent to "${input}"!`)
      setAddMemberModalTeam(null)
      setAddMemberInput('')
      await loadStudentData()
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send invitation.'
      showToast.error(errMsg)
    } finally {
      setIsSubmittingAddMember(false)
    }
  }

  const handleSubmitDisbandRequest = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !disbandModalTeam) return
    const reason = disbandReason.trim()
    if (!reason) {
      showToast.warning('Please describe the reason for your disbandment request.')
      return
    }
    setIsSubmittingDisband(true)
    try {
      await teamsService.requestTeamDisband(
        disbandModalTeam.$id,
        user.$id,
        reason,
        profile?.phone,
      )
      showToast.success(
        `Disband request for "${disbandModalTeam.name || disbandModalTeam.teamName}" submitted to administrators for review.`,
      )
      setDisbandModalTeam(null)
      setDisbandReason('')
      await loadStudentData()
    } catch (err: unknown) {
      showToast.error(err instanceof Error ? err.message : 'Failed to submit disband request.')
    } finally {
      setIsSubmittingDisband(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] text-white">
        <Loader2 className="animate-spin text-[#00E5FF]" size={36} />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050816] px-4 pt-20 text-white">
        <div className="relative w-full max-w-md border border-white/10 bg-[#080A0F] p-8 text-center shadow-2xl">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#FF6B00]">
            [OFFICIAL ANNOUNCEMENT]
          </span>
          <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">
            Registrations Closed
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Online registrations are officially closed. No further registrations will be accepted. For official queries, please contact the organising team.
          </p>

          <button
            type="button"
            disabled
            className="mt-6 inline-flex items-center gap-2 border border-white/15 bg-white/5 px-6 py-3 font-mono text-xs font-black uppercase tracking-[0.18em] text-slate-400 cursor-not-allowed opacity-80"
          >
            <Lock size={14} />
            <span>Registrations Closed</span>
          </button>
        </div>
      </div>
    )
  }

  const pendingInvites = invitations.filter((i) => i.status === 'pending')
  const userPrefs = (user?.prefs as Record<string, any>) || {}
  const currentUsername =
    profile?.userId ||
    (profile as any)?.username ||
    userPrefs.username ||
    (user.email ? user.email.split('@')[0] : '')

  return (
    <div className="min-h-screen bg-[#050816] pb-24 pt-28 text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Welcome Header */}
        <div className="relative mb-10 border-b border-white/10 pb-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#00E5FF]">
                Student Dashboard
              </span>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                Welcome, {profile?.fullName || user.name}
              </h1>
              <p className="mt-1 font-mono text-xs text-slate-400">
                <span className="text-[#00E5FF] font-bold">@{profile?.userId || profile?.username || user.name.toLowerCase().replace(/\s+/g, '_')}</span>
                {profile?.rollNumber ? ` • Roll: ${profile.rollNumber}` : ''}
                {profile?.department ? (
                  <>
                    {' '}• <span className="text-[#00E5FF]">
                      {profile.department === 'OTHER' && profile.customDepartment ? profile.customDepartment : profile.department}
                    </span>
                  </>
                ) : null}
                {profile?.semester ? (
                  <>
                    {' '}• <span className="text-slate-300">{profile.semester}</span>
                  </>
                ) : null}
                {' '}• <span className="text-[#FF6B00]">Central University of Jammu</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleOpenEditModal}
                className="flex items-center gap-1.5 border border-[#00E5FF]/50 bg-[#00E5FF]/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#00E5FF] hover:bg-[#00E5FF] hover:text-black transition-all shadow-[0_0_15px_rgba(0,229,255,0.15)]"
              >
                <Edit3 size={13} />
                <span>Edit Profile</span>
              </button>
              <Link
                to="/events"
                className="flex items-center gap-2 border border-white/15 bg-white/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] text-white transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00]"
              >
                <span>Browse Events</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* LEFT & CENTER COLUMNS (Widgets 1, 2, 3) */}
          <div className="space-y-8 lg:col-span-2">
            {/* =========================================================================
                WIDGET 1: PENDING INVITATIONS WIDGET
            ========================================================================= */}
            <section className="relative overflow-hidden border border-white/10 bg-[#080A0F] p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-[#FF6B00]" />
                  <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white">
                    Pending Team Invitations ({pendingInvites.length})
                  </h2>
                </div>
                {pendingInvites.length > 0 && (
                  <span className="flex h-2 w-2 rounded-full bg-[#FF6B00] animate-ping" />
                )}
              </div>

              <div className="mt-5 space-y-4">
                {loadingData ? (
                  <div className="flex justify-center py-6 text-slate-500">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : pendingInvites.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 font-mono">
                    No pending team invitations at this moment.
                  </div>
                ) : (
                  pendingInvites.map((invite) => (
                    <div
                      key={invite.$id}
                      className="border border-white/10 bg-[#050816] p-4 transition-colors hover:border-[#FF6B00]/40"
                    >
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#00E5FF]">
                            INVITATION FROM {invite.inviterName || invite.invitedByUserName || 'Team Leader'}
                          </span>
                          <h3 className="mt-1 text-base font-bold text-white">
                            Team: {invite.teamName}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-400">
                            Event: <span className="text-slate-200">{invite.eventTitle}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            disabled={actionLoading === invite.$id}
                            onClick={() => handleInvitationResponse(invite.$id, 'accepted')}
                            className="flex items-center gap-1.5 border border-emerald-500/60 bg-emerald-500/10 px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-black disabled:opacity-50"
                          >
                            {actionLoading === invite.$id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={13} />
                            )}
                            Accept
                          </button>

                          <button
                            disabled={actionLoading === invite.$id}
                            onClick={() => handleInvitationResponse(invite.$id, 'declined')}
                            className="flex items-center gap-1.5 border border-red-500/40 bg-red-500/10 px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-red-400 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50"
                          >
                            <XCircle size={13} />
                            Decline
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* =========================================================================
                WIDGET 2: MY ENROLLED EVENTS
            ========================================================================= */}
            <section className="relative overflow-hidden border border-white/10 bg-[#080A0F] p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-[#00E5FF]" />
                  <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white">
                    My Enrolled Events ({registrations.length})
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {loadingData ? (
                  <div className="flex justify-center py-6 text-slate-500">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : registrations.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 font-mono">
                    You have not registered for any events yet. Check out the{' '}
                    <Link to="/events" className="text-[#00E5FF] hover:underline">
                      Events Catalog
                    </Link>
                    !
                  </div>
                ) : (
                  registrations.map((reg) => (
                    <div
                      key={reg.$id}
                      className="border border-white/10 bg-[#050816] p-4 transition-colors hover:border-[#00E5FF]/40"
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-[8px] uppercase tracking-[0.2em] px-2 py-0.5 border ${
                                reg.registrationType === 'solo'
                                  ? 'border-[#00E5FF]/40 text-[#00E5FF]'
                                  : 'border-[#FF6B00]/40 text-[#FF6B00]'
                              }`}
                            >
                              {reg.registrationType === 'solo' ? 'SOLO EVENT' : 'TEAM EVENT'}
                            </span>
                            {reg.checkedIn ? (
                              <span className="flex items-center gap-1 font-mono text-[8px] text-emerald-400 border border-emerald-500/30 bg-emerald-950/20 px-1.5 py-0.5">
                                <ShieldCheck size={10} /> Gate Checked-In
                              </span>
                            ) : (
                              <span className="font-mono text-[8px] text-slate-400 border border-white/10 px-1.5 py-0.5">
                                Pending Entry
                              </span>
                            )}
                          </div>
                          <h3 className="mt-1.5 text-base font-black uppercase text-white">
                            {reg.eventTitle}
                          </h3>
                          {reg.registrationType !== 'solo' && reg.teamName && (
                            <p className="font-mono text-[10px] text-slate-400">
                              Roster Squad: <span className="text-white font-bold">{reg.teamName}</span>
                            </p>
                          )}
                          <p className="mt-1 font-mono text-[9px] text-slate-500">
                            Registered: {new Date(reg.registeredAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="text-right flex items-center gap-4 sm:flex-col sm:items-end">
                          <div>
                            <span className="font-mono text-[9px] text-slate-500 block uppercase tracking-widest">
                              Registration ID
                            </span>
                            <span className="font-mono text-xs text-[#00E5FF] font-bold tracking-wider">
                              {reg.qrCode ? `${reg.qrCode.slice(0, 18)}...` : `YTR-${reg.$id.slice(0, 8).toUpperCase()}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* =========================================================================
                WIDGET 3: MY TEAMS (LEADER & MEMBER ROSTERS)
            ========================================================================= */}
            <section className="relative overflow-hidden border border-white/10 bg-[#080A0F] p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[#FF6B00]" />
                  <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white">
                    My Teams ({userTeams.length})
                  </h2>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                {loadingData ? (
                  <div className="flex justify-center py-6 text-slate-500">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : userTeams.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 font-mono">
                    You have not joined or formed any teams yet. Check pending invitations or register for a team event!
                  </div>
                ) : (
                  userTeams.map((t) => {
                    const isLeader = t.userRole === 'Leader'
                    const acceptedCount = (t.members || []).filter(
                      (m) => m.status === 'confirmed' || m.status === 'accepted',
                    ).length
                    const totalRosterCount = (t.members || []).length
                    const maxCap = t.maxTeamSize || 4
                    const canAddMore = totalRosterCount < maxCap
                    const canDirectCancel = acceptedCount <= 1 // Only leader has accepted; no confirmed teammates!

                    return (
                      <div
                        key={t.$id}
                        className="border border-white/10 bg-[#050816] p-4 transition-colors hover:border-[#00E5FF]/30"
                      >
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-white">
                                {t.name || t.teamName}
                              </span>

                              {/* Leader vs Member Badge */}
                              <span
                                className={`border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] ${
                                  isLeader
                                    ? 'border-[#FF6B00]/60 text-[#FF6B00] bg-orange-950/30'
                                    : 'border-[#00E5FF]/60 text-[#00E5FF] bg-cyan-950/30'
                                }`}
                              >
                                {isLeader ? 'LEADER' : 'MEMBER'}
                              </span>

                              {/* Team Status Badge */}
                              <span
                                className={`border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] ${
                                  t.status === 'confirmed'
                                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20'
                                    : 'border-yellow-500/40 text-yellow-400 bg-yellow-950/20'
                                }`}
                              >
                                {t.status === 'confirmed' ? 'CONFIRMED' : 'WAITING FOR MEMBERS'}
                              </span>

                              {/* Disband Requested Badge */}
                              {t.isDisbandRequested && (
                                <span className="border border-amber-500/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-amber-300 animate-pulse flex items-center gap-1">
                                  <AlertCircle size={10} />
                                  <span>DISBAND PENDING APPROVAL</span>
                                </span>
                              )}
                            </div>

                            <p className="mt-1.5 text-xs text-slate-400">
                              Event: <span className="text-white font-medium">{t.eventTitle || 'Event'}</span> • Leader:{' '}
                              <span className="text-white font-medium">
                                {isLeader ? 'You (Team Leader)' : t.leaderName}
                              </span>
                            </p>
                          </div>

                          <div className="text-right font-mono text-xs text-slate-400">
                            Status:{' '}
                            <span className="text-[#00E5FF] uppercase font-bold">
                              {t.status === 'confirmed' ? 'READY / CONFIRMED' : 'PENDING'}
                            </span>
                          </div>
                        </div>

                        {/* Disband Notice Callout */}
                        {t.isDisbandRequested && (
                          <div className="mt-3 flex items-center gap-2 border border-amber-500/30 bg-amber-950/20 p-2.5 text-xs font-mono text-amber-300">
                            <AlertCircle size={14} className="text-amber-400 shrink-0" />
                            <span>
                              Disband request submitted to Administrators. Member registrations will be safely cancelled once approved.
                            </span>
                          </div>
                        )}

                        {/* Team Roster breakdown if available */}
                        {t.members && t.members.length > 0 && (
                          <div className="mt-3 border-t border-white/5 pt-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
                                Squad Roster ({totalRosterCount} / {maxCap}):
                              </span>
                              {isLeader && !t.isDisbandRequested && (
                                <span className="font-mono text-[9px] text-slate-500">
                                  Leader Controls Enabled
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {t.members.map((m, idx) => {
                                const isSelf =
                                  m.role === 'Leader' ||
                                  m.userId === user.$id ||
                                  (m.email && m.email === user.email)
                                return (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1.5 border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-slate-300"
                                  >
                                    <span
                                      className={`h-1.5 w-1.5 rounded-full ${
                                        m.status === 'confirmed' || m.status === 'accepted'
                                          ? 'bg-emerald-400'
                                          : 'bg-yellow-400'
                                      }`}
                                    />
                                    <span className="text-white font-medium">@{((m.username || m.name || '').replace(/^@/, ''))}</span>
                                    <span className="text-[8px] text-slate-500 uppercase">
                                      ({m.role === 'Leader' ? 'Leader' : m.status === 'pending' ? 'Invited' : 'Joined'})
                                    </span>

                                    {/* Action button: Cancel pending invite or remove member */}
                                    {isLeader && !isSelf && !t.isDisbandRequested && (
                                      <button
                                        type="button"
                                        title={
                                          m.status === 'pending'
                                            ? 'Cancel invitation'
                                            : 'Remove member from squad'
                                        }
                                        onClick={() => handleRemoveMemberOrInvite(t, m)}
                                        disabled={actionLoading === `${t.$id}-${m.invitationId || m.email}`}
                                        className="ml-1 text-slate-400 hover:text-red-400 transition-colors p-0.5"
                                      >
                                        {actionLoading === `${t.$id}-${m.invitationId || m.email}` ? (
                                          <Loader2 size={10} className="animate-spin text-red-400" />
                                        ) : (
                                          <X size={11} />
                                        )}
                                      </button>
                                    )}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {t.status === 'pending' && !t.isDisbandRequested && (
                          <p className="mt-2.5 font-mono text-[9px] text-slate-500">
                            Waiting for invited teammates to accept invitations. Team status confirms automatically when minimum team size is achieved.
                          </p>
                        )}

                        {/* Leader Team Actions Bar */}
                        {isLeader && !t.isDisbandRequested && (
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                            <div className="flex items-center gap-2">
                              {canAddMore && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddMemberModalTeam(t)
                                    setAddMemberInput('')
                                  }}
                                  className="flex items-center gap-1.5 border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#00E5FF] hover:bg-[#00E5FF] hover:text-black transition-colors"
                                >
                                  <UserPlus size={12} />
                                  <span>Add Teammate</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {canDirectCancel ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelPendingTeam(t)}
                                  disabled={actionLoading === t.$id}
                                  className="flex items-center gap-1 border border-red-500/40 bg-red-950/20 px-2.5 py-1 font-mono text-[10px] uppercase text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                                >
                                  {actionLoading === t.$id ? (
                                    <Loader2 size={11} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={11} />
                                  )}
                                  <span>Cancel Squad</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDisbandModalTeam(t)
                                    setDisbandReason('')
                                  }}
                                  className="flex items-center gap-1 border border-amber-500/40 bg-amber-950/20 px-2.5 py-1 font-mono text-[10px] uppercase text-amber-400 hover:bg-amber-500 hover:text-black transition-colors"
                                >
                                  <AlertCircle size={11} />
                                  <span>Request Disband</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN (Widget 4: Participant Profile & Stats) */}
          <div className="space-y-8">
            {/* =========================================================================
                WIDGET 4: PARTICIPANT PROFILE & ACCOUNT STATUS
            ========================================================================= */}
            <section className="relative overflow-hidden border border-white/10 bg-[#080A0F] p-6 shadow-xl">
              <div className="pointer-events-none absolute inset-0">
                <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[#00E5FF]" />
                <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[#FF6B00]" />
                <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[#FF6B00]" />
                <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[#00E5FF]" />
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-[#00E5FF]" />
                  <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white">
                    Participant Profile
                  </h2>
                </div>
              </div>

              {/* Profile Avatar & Identity Header */}
              <div className="mt-5 flex items-center gap-4">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center border-2 border-[#00E5FF]/50 bg-[#050816] font-mono text-xl font-black text-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.2)]">
                  {(profile?.fullName || user.name || 'U').charAt(0).toUpperCase()}
                  <span className="absolute -bottom-1 -right-1 h-2 w-2 bg-[#FF6B00]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{profile?.fullName || profile?.name || user.name}</span>
                  </h3>
                  {currentUsername && (
                    <span className="inline-block mt-0.5 font-mono text-xs font-bold text-[#00E5FF]">
                      @{currentUsername}
                    </span>
                  )}
                  <p className="font-mono text-[10px] text-slate-300">
                    {profile?.rollNumber || profile?.rollNo || 'Roll Number Not Provided'}
                  </p>
                  <p className="mt-0.5 font-mono text-[9px] text-slate-400">
                    {user.email}
                  </p>
                </div>
              </div>

              {/* Fest Engagement Metrics */}
              <div className="mt-6 grid grid-cols-3 gap-2 border-y border-white/10 py-4 text-center">
                <div className="border-r border-white/10 pr-2">
                  <span className="block font-mono text-lg font-black text-white">
                    {registrations.length}
                  </span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-slate-400">
                    Events Enrolled
                  </span>
                </div>
                <div className="border-r border-white/10 px-2">
                  <span className="block font-mono text-lg font-black text-[#FF6B00]">
                    {userTeams.length}
                  </span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-slate-400">
                    My Teams
                  </span>
                </div>
                <div className="pl-2">
                  <span className="block font-mono text-lg font-black text-[#00E5FF]">
                    {pendingInvites.length}
                  </span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-slate-400">
                    Pending Invites
                  </span>
                </div>
              </div>

              {/* Student Academic Metadata */}
              <div className="mt-5 space-y-3 text-xs">
                <div>
                  <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">
                    Registered Username
                  </span>
                  <span className="font-mono text-xs text-[#00E5FF] font-semibold">
                    @{currentUsername || 'not_set'}
                  </span>
                </div>

                <div>
                  <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">
                    Department & Branch
                  </span>
                  <span className="text-slate-300">
                    {profile?.department === 'OTHER' && profile?.customDepartment
                      ? profile.customDepartment
                      : (profile?.department || profile?.branch || 'Not specified')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">
                      Semester
                    </span>
                    <span className="font-mono text-slate-300">
                      {profile?.semester || 'Semester 4'}
                    </span>
                  </div>

                  <div>
                    <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">
                      Phone / WhatsApp
                    </span>
                    <span className="font-mono text-slate-300">
                      {profile?.phone || 'Not provided'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-slate-500">
                    Institution
                  </span>
                  <span className="text-slate-300">
                    Central University of Jammu
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 border-t border-white/10 pt-4 space-y-2">
                <button
                  onClick={handleOpenEditModal}
                  className="flex w-full items-center justify-center gap-2 border border-[#00E5FF]/40 bg-[#00E5FF]/10 py-2 font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#00E5FF] transition-colors hover:bg-[#00E5FF] hover:text-black"
                >
                  <Edit3 size={13} />
                  <span>Update Profile Data</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* =========================================================================
          EDIT PROFILE MODAL
      ========================================================================= */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg border border-white/10 bg-[#080A0F] p-6 shadow-2xl"
            >
              {/* Corner Sci-Fi Decors */}
              <div className="pointer-events-none absolute inset-0">
                <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[#00E5FF]" />
                <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[#FF6B00]" />
                <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[#FF6B00]" />
                <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[#00E5FF]" />
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <Edit3 size={18} className="text-[#00E5FF]" />
                  <h3 className="text-lg font-black uppercase tracking-tight text-white">
                    Update Participant Profile
                  </h3>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveProfileSubmit} className="mt-4 space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                {/* Full Name & Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.fullName}
                      onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                      className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Username (for team invites)
                    </label>
                    <div className="relative mt-1">
                      <AtSign size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="e.g. techyyp"
                        value={editFormData.username}
                        onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                        className="w-full border border-white/10 bg-[#050816] pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                      />
                    </div>
                  </div>
                </div>

                {/* Roll Number & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Roll Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.rollNumber}
                      onChange={(e) => setEditFormData({ ...editFormData, rollNumber: e.target.value })}
                      className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Contact Phone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                </div>

                {/* Department & Semester */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Department / Branch *
                    </label>
                    <select
                      value={editFormData.department}
                      onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                      className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                    >
                      {DEPARTMENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Current Semester * (Max 8)
                    </label>
                    <select
                      required
                      value={editFormData.semester}
                      onChange={(e) => setEditFormData({ ...editFormData, semester: e.target.value })}
                      className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                    >
                      <option value="" disabled className="bg-[#080A0F] text-slate-500">
                        Select Semester (1 - 8)
                      </option>
                      {SEMESTER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#080A0F] text-white">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Custom Department if OTHER selected */}
                {editFormData.department === 'OTHER' && (
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Specify Custom Department *
                    </label>
                    <input
                      type="text"
                      required
                      value={editFormData.customDepartment}
                      onChange={(e) => setEditFormData({ ...editFormData, customDepartment: e.target.value })}
                      placeholder="e.g. Mechanical, Civil, Biotech..."
                      className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                )}

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 font-mono text-xs uppercase text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="flex items-center gap-2 border border-[#00E5FF] bg-[#00E5FF] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black hover:bg-transparent hover:text-[#00E5FF] disabled:opacity-50"
                  >
                    {isSavingProfile ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Updating Profile...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          ADD TEAMMATE MODAL
      ========================================================================= */}
      <AnimatePresence>
        {addMemberModalTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md border border-white/10 bg-[#080A0F] p-6 shadow-2xl"
            >
              {/* Corner Sci-Fi Decors */}
              <div className="pointer-events-none absolute inset-0">
                <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[#00E5FF]" />
                <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[#FF6B00]" />
                <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[#FF6B00]" />
                <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[#00E5FF]" />
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <UserPlus size={18} className="text-[#00E5FF]" />
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white font-mono">
                    Invite Teammate
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddMemberModalTeam(null)
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3">
                <p className="font-mono text-xs text-slate-300">
                  Team:{' '}
                  <span className="font-bold text-white">
                    {addMemberModalTeam.name || addMemberModalTeam.teamName}
                  </span>
                </p>
                <p className="font-mono text-xs text-slate-400 mt-0.5">
                  Event: <span className="text-[#00E5FF]">{addMemberModalTeam.eventTitle || 'Event'}</span>
                </p>
              </div>

              <form onSubmit={handleSendAddMemberInvite} className="mt-4 space-y-4">
                {(() => {
                  const cleanInput = addMemberInput.trim()
                  const isEmail = cleanInput.includes('@') && cleanInput.includes('.')
                  const isRollNo = !cleanInput.startsWith('@') && /\d/.test(cleanInput)
                  const isHandle = cleanInput.startsWith('@')
                  return (
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Teammate Handle, Email, or Roll No *
                        </label>
                        {cleanInput && (
                          <span className="font-mono text-[8px] uppercase tracking-wider text-[#00E5FF] bg-[#00E5FF]/10 px-1.5 py-0.5 rounded border border-[#00E5FF]/20">
                            {isEmail ? 'Email Address' : isRollNo ? 'Roll Number' : isHandle ? 'Username Handle' : 'Identifier'}
                          </span>
                        )}
                      </div>
                      <div className="relative mt-1">
                        {isEmail ? (
                          <Mail size={14} className="absolute left-2.5 top-2.5 text-[#00E5FF] transition-colors" />
                        ) : isRollNo ? (
                          <GraduationCap size={14} className="absolute left-2.5 top-2.5 text-[#00E5FF] transition-colors" />
                        ) : isHandle ? (
                          <AtSign size={14} className="absolute left-2.5 top-2.5 text-[#00E5FF] transition-colors" />
                        ) : (
                          <User size={14} className="absolute left-2.5 top-2.5 text-slate-500 transition-colors" />
                        )}
                        <input
                          type="text"
                          required
                          placeholder="e.g. 25BECSE52, student@cujammu.ac.in, or @priyanshu"
                          value={addMemberInput}
                          onChange={(e) => {
                            setAddMemberInput(e.target.value)
                          }}
                          className="w-full border border-white/10 bg-[#050816] pl-8 pr-3 py-2 font-mono text-xs text-white outline-none focus:border-[#00E5FF]"
                        />
                      </div>
                      <p className="mt-1 font-mono text-[9px] text-slate-500">
                        An invitation will be generated and dispatched immediately to their dashboard and email.
                      </p>
                    </div>
                  )
                })()}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMemberModalTeam(null)
                    }}
                    className="px-3 py-1.5 font-mono text-xs uppercase text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAddMember}
                    className="flex items-center gap-1.5 border border-[#00E5FF] bg-[#00E5FF] px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-black hover:bg-transparent hover:text-[#00E5FF] disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingAddMember ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Sending Invite...</span>
                      </>
                    ) : (
                      <span>Send Invitation</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
          REQUEST DISBAND MODAL (Admin Approval Required)
      ========================================================================= */}
      <AnimatePresence>
        {disbandModalTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md border border-amber-500/40 bg-[#080A0F] p-6 shadow-2xl"
            >
              {/* Corner Sci-Fi Decors */}
              <div className="pointer-events-none absolute inset-0">
                <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-amber-400" />
                <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-amber-400" />
                <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-amber-400" />
                <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-amber-400" />
              </div>

              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-amber-400" />
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white font-mono">
                    Request Squad Disbandment
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDisbandModalTeam(null)
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 border border-amber-500/30 bg-amber-950/20 p-3 font-mono text-[11px] text-amber-300">
                <p className="font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ShieldCheck size={14} />
                  <span>Admin Approval Required</span>
                </p>
                <p className="text-slate-300 text-[10px] leading-relaxed">
                  This squad contains confirmed teammates. To prevent accidental disqualification or lost event slots, disband requests must be reviewed and confirmed by festival administrators before cancellation.
                </p>
              </div>

              <div className="mt-3">
                <p className="font-mono text-xs text-slate-300">
                  Team:{' '}
                  <span className="font-bold text-white">
                    {disbandModalTeam.name || disbandModalTeam.teamName}
                  </span>
                </p>
                <p className="font-mono text-xs text-slate-400 mt-0.5">
                  Event: <span className="text-[#00E5FF]">{disbandModalTeam.eventTitle || 'Event'}</span>
                </p>
              </div>

              <form onSubmit={handleSubmitDisbandRequest} className="mt-4 space-y-4">
                <div>
                  <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                    Reason for Disbandment Request *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe why the team cannot participate (e.g. teammate medical emergency, scheduling conflict)..."
                    value={disbandReason}
                    onChange={(e) => setDisbandReason(e.target.value)}
                    className="mt-1 w-full border border-white/10 bg-[#050816] p-2.5 font-mono text-xs text-white outline-none focus:border-amber-400"
                  />
                  <p className="mt-1 font-mono text-[9px] text-slate-500">
                    This reason will be submitted directly to the event coordinators.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setDisbandModalTeam(null)
                    }}
                    className="px-3 py-1.5 font-mono text-xs uppercase text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDisband}
                    className="flex items-center gap-1.5 border border-amber-500 bg-amber-500 px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-black hover:bg-transparent hover:text-amber-400 disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingDisband ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <span>Submit Disband Request</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

