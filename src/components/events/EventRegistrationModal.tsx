import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Plus, Trash2, CheckCircle2, AlertCircle, ShieldAlert, Loader2, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { teamsService, MAX_EVENT_REGISTRATIONS_PER_USER } from '../../services/appwrite/teams.service'
import type { EventDocument } from '../../types/database.types'
import { showToast } from '../../utils/toast'
import { isEventFullyBooked, getEventSeatsSummary } from '../../utils/eventCapacity'

export interface EventRegistrationModalProps {
  event: EventDocument | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function EventRegistrationModal({
  event,
  isOpen,
  onClose,
  onSuccess,
}: EventRegistrationModalProps) {
  const { user, profile, openAuthModal } = useAuth()
  const isSubmittingRef = useRef(false)

  // Form states matching database attributes
  const [teamName, setTeamName] = useState('')
  const [memberEmails, setMemberEmails] = useState<string[]>([''])
  const [studentRollNo, setStudentRollNo] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [studentDepartment, setStudentDepartment] = useState('')
  const [studentSemester, setStudentSemester] = useState('')
  const [collegeName, setCollegeName] = useState('Central University of Jammu')

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [existingEnrollment, setExistingEnrollment] = useState<{
    enrolled: boolean
    reason?: string
    teamName?: string
  } | null>(null)
  const [userRegisteredCount, setUserRegisteredCount] = useState<number>(0)
  const [checkingEnrollment, setCheckingEnrollment] = useState(false)
  const [, setDeadlineTick] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    const timer = window.setInterval(() => setDeadlineTick((tick) => tick + 1), 15000)
    return () => window.clearInterval(timer)
  }, [isOpen])

  useEffect(() => {
    if (profile) {
      setStudentRollNo(profile.rollNumber || profile.rollNo || '')
      setStudentPhone(profile.phone || '')
      setStudentDepartment(
        profile.department === 'OTHER' && profile.customDepartment
          ? profile.customDepartment
          : (profile.department || profile.branch || '')
      )
      setStudentSemester(profile.semester || '')
      setCollegeName(profile.college || 'Central University of Jammu')
    }
  }, [profile])

  // Check whether user is already enrolled for this event (as leader, member, or solo)
  // and count total registered events across the fest
  useEffect(() => {
    if (!isOpen || !event || !user) {
      setExistingEnrollment(null)
      setUserRegisteredCount(0)
      return
    }

    setCheckingEnrollment(true)
    const userIdentifiers = [
      profile?.userId,
      user.email,
      user.email.split('@')[0],
      (user.prefs as Record<string, any>)?.username,
      profile?.username,
      profile?.rollNumber,
      profile?.rollNo,
    ].filter(Boolean) as string[]

    Promise.all([
      teamsService.checkUserEventEnrollment(event.$id, user.$id, userIdentifiers),
      teamsService.getUserRegistrations(user.$id, userIdentifiers),
    ])
      .then(([enrollRes, userRegs]) => {
        setExistingEnrollment(enrollRes)
        setUserRegisteredCount(userRegs.length)
      })
      .catch(() => {
        setExistingEnrollment(null)
        setUserRegisteredCount(0)
      })
      .finally(() => {
        setCheckingEnrollment(false)
      })
  }, [isOpen, event, user, profile])

  if (!isOpen || !event) return null

  const isTeamEvent = (event.eventType || event.format) === 'team' || (event.minTeamSize || 1) > 1
  const seats = getEventSeatsSummary(event)
  const isFullyBooked = isEventFullyBooked(event)
  const isRegistrationClosed = true
  const isLimitReached = !existingEnrollment?.enrolled && userRegisteredCount >= MAX_EVENT_REGISTRATIONS_PER_USER
  const requiredAdditionalMembers = Math.max(1, (event.minTeamSize || 2) - 1)
  const maxAdditionalMembers = Math.max(1, (event.maxTeamSize || 4) - 1)

  const handleAddMember = () => {
    if (memberEmails.length < maxAdditionalMembers) {
      setMemberEmails([...memberEmails, ''])
    }
  }

  const handleRemoveMember = (index: number) => {
    const updated = memberEmails.filter((_, i) => i !== index)
    setMemberEmails(updated.length > 0 ? updated : [''])
  }

  const handleMemberEmailChange = (index: number, val: string) => {
    const updated = [...memberEmails]
    updated[index] = val
    setMemberEmails(updated)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isSubmittingRef.current) return

    if (isRegistrationClosed) {
      showToast.info('Registrations for Yantrotsav 2026 events are now officially closed.')
      return
    }

    if (!user) {
      openAuthModal('login')
      return
    }

    if (existingEnrollment?.enrolled) {
      showToast.info(
        `You are already enrolled in this event (${existingEnrollment.reason}). Duplicate registrations are not permitted.`,
      )
      return
    }

    if (isLimitReached) {
      showToast.error(
        `Registration limit reached: You have already registered for ${userRegisteredCount} events (maximum ${MAX_EVENT_REGISTRATIONS_PER_USER} allowed per student).`,
      )
      return
    }

    if (isEventFullyBooked(event)) {
      showToast.error('This event is completely booked. Registration is closed.')
      return
    }

    if (event.status !== 'published') {
      showToast.error('Registration is closed for this event.')
      return
    }

    if (event.registrationDeadline && new Date(event.registrationDeadline).getTime() < Date.now()) {
      showToast.error('Registration deadline for this event has passed.')
      return
    }

    isSubmittingRef.current = true
    setLoading(true)

    try {
      if (!isTeamEvent) {
        if (studentSemester) {
          const semNum = parseInt(studentSemester, 10)
          if (isNaN(semNum) || semNum < 1 || semNum > 8) {
            showToast.warning('Please enter a valid semester number between 1 and 8.')
            return
          }
        }
        // Solo Registration with complete student profile attributes
        await teamsService.registerSolo({
          eventId: event.$id,
          userId: user.$id,
          studentName: (profile?.fullName || profile?.name || user.name || 'Student').trim().slice(0, 100),
          studentEmail: user.email.trim().toLowerCase(),
          studentPhone: studentPhone.trim().slice(0, 20),
          studentRollNumber: studentRollNo.trim().slice(0, 50),
          studentRollNo: studentRollNo.trim().slice(0, 50),
          department: studentDepartment.trim().slice(0, 100),
          semester: studentSemester.trim().slice(0, 10),
          collegeName: collegeName.trim().slice(0, 100),
        })
        showToast.success(`Registered successfully for "${event.title || 'Event'}"!`)
      } else {
        // Team Registration
        const sanitizedTeamName = teamName.trim().slice(0, 80)
        if (!sanitizedTeamName) {
          showToast.warning('Please specify a valid Team Name.')
          return
        }

        const validMembers = Array.from(
          new Set(
            memberEmails
              .map((m) => m.trim().replace(/^@/, ''))
              .filter(Boolean),
          ),
        )

        if (validMembers.length < requiredAdditionalMembers) {
          showToast.warning(
            `Minimum team size is ${event.minTeamSize}. You must invite at least ${requiredAdditionalMembers} member(s).`,
          )
          return
        }

        await teamsService.createTeam({
          eventId: event.$id,
          teamName: sanitizedTeamName,
          leaderId: user.$id,
          leaderName: (profile?.fullName || profile?.name || user.name || 'Team Leader').trim().slice(0, 100),
          leaderEmail: user.email.trim().toLowerCase(),
          memberEmails: validMembers,
        })
        showToast.success(`Squad "${sanitizedTeamName}" registered successfully!`)
      }

      setSuccess(true)
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      if (err instanceof Error) {
        showToast.error(err.message)
      } else {
        showToast.error('Failed to complete registration.')
      }
    } finally {
      isSubmittingRef.current = false
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSuccess(false)
    setTeamName('')
    setMemberEmails([''])
    onClose()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-lg overflow-hidden border border-white/10 bg-[#080A0F] shadow-[0_25px_60px_rgba(0,0,0,0.9)]"
        >
          {/* Cyber framing corners */}
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-[#00E5FF]" />
            <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-[#FF6B00]" />
            <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-[#FF6B00]" />
            <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-[#00E5FF]" />
            <div className="h-0.5 w-full bg-gradient-to-r from-[#00E5FF] via-white/10 to-[#FF6B00]" />
          </div>

          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00E5FF]">
                  [EVENT REGISTRATION]
                </span>
                <span className="border border-white/20 px-1.5 py-0.5 font-mono text-[8px] uppercase text-[#FF6B00]">
                  {isTeamEvent ? 'TEAM EVENT' : 'SOLO EVENT'}
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-black uppercase tracking-tight text-white">
                {event.title}
              </h2>
            </div>

            <button
              onClick={handleClose}
              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="max-h-[75vh] overflow-y-auto p-6">
            {success ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="mt-4 text-xl font-black uppercase tracking-tight text-white">
                  {isTeamEvent ? 'Team Invitations Dispatched!' : 'Registration Confirmed!'}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  {isTeamEvent
                    ? `Team "${teamName}" created successfully with your registered teammates! You can track your team in your student dashboard.`
                    : `You have successfully enrolled in ${event.title}. Your registration is confirmed in your student dashboard.`}
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link
                    to="/dashboard"
                    onClick={handleClose}
                    className="flex items-center justify-center gap-2 border border-[#FF6B00] bg-[#FF6B00] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-white transition-all hover:bg-transparent hover:text-[#FF6B00]"
                  >
                    <span>View Student Dashboard</span>
                    <ArrowRight size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="border border-white/15 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-slate-400 transition-colors hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : !user ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 text-[#FF6B00]">
                  <User size={24} />
                </div>
                <h3 className="mt-4 text-lg font-bold uppercase tracking-tight text-white">
                  Student Sign In Required
                </h3>
                <p className="mt-2 text-xs text-slate-400">
                  You need an active YANTROTSAV student account to register for this event.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    handleClose()
                    openAuthModal('login')
                  }}
                  className="mt-6 inline-flex items-center gap-2 border border-[#00E5FF] bg-[#00E5FF] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition-all hover:bg-transparent hover:text-[#00E5FF]"
                >
                  <span>Sign In / Create Account</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            ) : checkingEnrollment ? (
              <div className="py-12 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center gap-3">
                <Loader2 size={24} className="animate-spin text-[#00E5FF]" />
                <span>VERIFYING REGISTRATION STATUS...</span>
              </div>
            ) : existingEnrollment?.enrolled ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                  <CheckCircle2 size={32} />
                </div>
                <h3 className="mt-4 text-xl font-black uppercase tracking-tight text-white">
                  Already Enrolled In This Event
                </h3>
                <p className="mt-2 text-xs text-slate-300">
                  You are already registered for this event ({existingEnrollment.reason}). Duplicate registrations are not permitted.
                </p>
                {existingEnrollment.teamName && (
                  <p className="mt-2 text-xs font-mono text-[#00E5FF] font-bold">
                    Team Squad: {existingEnrollment.teamName}
                  </p>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link
                    to="/dashboard"
                    onClick={handleClose}
                    className="flex items-center justify-center gap-2 border border-emerald-500 bg-emerald-500 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-black transition-all hover:bg-transparent hover:text-emerald-400"
                  >
                    <span>View Registration on Dashboard</span>
                    <ArrowRight size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="border border-white/15 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-slate-400 transition-colors hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : isLimitReached ? (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400">
                  <ShieldAlert size={32} />
                </div>
                <h3 className="mt-4 text-xl font-black uppercase tracking-tight text-white">
                  Event Limit Reached ({userRegisteredCount}/{MAX_EVENT_REGISTRATIONS_PER_USER})
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  You have already registered for <span className="text-[#00E5FF] font-semibold">{MAX_EVENT_REGISTRATIONS_PER_USER} events</span> (solo registrations and team events combined).
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  Each student can participate in a maximum of {MAX_EVENT_REGISTRATIONS_PER_USER} events across YANTROTSAV. You can view your registered events in your dashboard.
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Link
                    to="/dashboard"
                    onClick={handleClose}
                    className="flex items-center justify-center gap-2 border border-[#FF6B00] bg-[#FF6B00] px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.15em] text-white transition-all hover:bg-transparent hover:text-[#FF6B00]"
                  >
                    <span>Go to My Dashboard</span>
                    <ArrowRight size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="border border-white/15 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.15em] text-slate-400 transition-colors hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* User registration quota counter badge */}
                <div className="flex items-center justify-between border border-white/10 bg-[#00E5FF]/5 px-3 py-2 text-[10px] font-mono">
                  <span className="text-slate-400">YOUR EVENT REGISTRATIONS:</span>
                  <span className="font-bold text-[#00E5FF]">
                    {userRegisteredCount} / {MAX_EVENT_REGISTRATIONS_PER_USER} EVENTS USED
                  </span>
                </div>

                {isRegistrationClosed && (
                  <div className="flex items-center gap-3 border border-red-500/50 bg-red-950/40 p-3 text-xs text-red-400">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>
                      Online registrations for all Yantrotsav 2026 events are now officially closed.
                    </span>
                  </div>
                )}

                {/* Event summary banner */}
                <div className="border border-white/10 bg-[#050816] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-slate-400">
                    <div>
                      <span className="text-slate-500">VENUE:</span>{' '}
                      <span className="text-white">{event.venue || 'TBA'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">{seats.label.toUpperCase()}:</span>{' '}
                      <span className={isFullyBooked ? 'text-[#FF6B00]' : 'text-white'}>
                        {seats.display} {seats.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">DATE:</span>{' '}
                      <span className="text-[#00E5FF]">
                        {(() => {
                          const rawDate = event.eventTiming || event.eventDate
                          if (!rawDate) return 'TBA'
                          const d = new Date(rawDate)
                          if (!isNaN(d.getTime())) {
                            const datePart = d.toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                            const timePart = rawDate.includes('T')
                              ? ` • ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
                              : ''
                            return `${datePart}${timePart}`
                          }
                          return rawDate
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {isTeamEvent ? (
                  <>
                    {/* Leader Identity Badge */}
                    <div className="border border-white/10 bg-[#050816] p-3 text-xs">
                      <span className="block font-mono text-[8px] uppercase tracking-[0.2em] text-[#FF6B00]">
                        TEAM LEADER IDENTITY
                      </span>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-white">
                          {profile?.fullName || user.name}
                        </span>
                        <span className="font-mono text-slate-400">
                          Roll: {profile?.rollNumber || profile?.rollNo || 'N/A'} •{' '}
                          {profile?.department === 'OTHER' && profile?.customDepartment
                            ? profile.customDepartment
                            : (profile?.department || 'N/A')}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Team Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter team name"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Teammate Usernames ({requiredAdditionalMembers} to {maxAdditionalMembers} required)
                        </label>
                        {memberEmails.length < maxAdditionalMembers && (
                          <button
                            type="button"
                            onClick={handleAddMember}
                            className="flex items-center gap-1 font-mono text-[9px] uppercase text-[#00E5FF] hover:underline"
                          >
                            <Plus size={12} /> Add Member
                          </button>
                        )}
                      </div>

                      <div className="mt-2 space-y-2">
                        {memberEmails.map((memberVal, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Enter teammate's username"
                              value={memberVal}
                              onChange={(e) => handleMemberEmailChange(idx, e.target.value)}
                              className="w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#FF6B00]"
                            />
                            {memberEmails.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(idx)}
                                className="rounded p-2 text-slate-500 hover:text-red-400"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        Add teammates by their registered username. Your team roster will be formed with these members.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Student Full Name
                        </label>
                        <input
                          type="text"
                          disabled
                          value={profile?.fullName || user.name}
                          className="mt-1 w-full border border-white/5 bg-[#050816]/50 px-3 py-2 text-xs text-slate-400 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Roll Number *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Enter student roll number"
                          value={studentRollNo}
                          onChange={(e) => setStudentRollNo(e.target.value)}
                          className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Department / Branch
                        </label>
                        <input
                          type="text"
                          value={studentDepartment}
                          onChange={(e) => setStudentDepartment(e.target.value)}
                          placeholder="Enter department or branch"
                          className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Current Semester (1 - 8)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={studentSemester}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '') {
                              setStudentSemester('')
                              return
                            }
                            const num = parseInt(val, 10)
                            if (!isNaN(num)) {
                              if (num < 1) setStudentSemester('1')
                              else if (num > 8) setStudentSemester('8')
                              else setStudentSemester(String(num))
                            }
                          }}
                          placeholder="1 to 8"
                          className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#FF6B00]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Phone / WhatsApp
                        </label>
                        <input
                          type="tel"
                          value={studentPhone}
                          onChange={(e) => setStudentPhone(e.target.value)}
                          placeholder="Enter contact number"
                          className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#FF6B00]"
                        />
                      </div>
                      <div>
                        <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                          Institution
                        </label>
                        <input
                          type="text"
                          disabled
                          value="Central University of Jammu"
                          className="mt-1 w-full border border-white/10 bg-[#050816]/60 px-3 py-2 text-xs text-slate-400 cursor-not-allowed outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading || isRegistrationClosed}
                  className="mt-6 flex w-full items-center justify-center gap-2 border border-red-500/50 bg-red-950/40 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-400 cursor-not-allowed opacity-90 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                >
                  <ShieldAlert size={16} />
                  <span>Registration Closed</span>
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
