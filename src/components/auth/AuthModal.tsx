import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Lock,
  Mail,
  User,
  Phone,
  Eye,
  EyeOff,
  AtSign,
  ShieldAlert,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { DEPARTMENT_OPTIONS, SEMESTER_OPTIONS } from '../../types/database.types'
import { showToast } from '../../utils/toast'
import { getUsernameError, normalizeUsername } from '../../utils/username'
import { getContactError, normalizeEmail, normalizeMobile } from '../../utils/profileValidation'

export default function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, openAuthModal, login, registerStudent } =
    useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [rollNo, setRollNo] = useState('')
  const [branch, setBranch] = useState('')
  const [customDepartment, setCustomDepartment] = useState('')
  const [semester, setSemester] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setName('')
    setUsername('')
    setPhone('')
    setRollNo('')
    setBranch('')
    setCustomDepartment('')
    setSemester('')
  }

  useEffect(() => {
    if (!authModalOpen) {
      resetForm()
    }
  }, [authModalOpen])

  if (!authModalOpen) return null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    showToast.error('Portal access and session creation are temporarily disabled due to system security maintenance.')
    return

    try {
      if (authModalMode === 'login') {
        if (!email.trim() || !password) {
          showToast.warning('Please enter both email/username and password.')
          return
        }
        setIsSubmitting(true)
        await login(email.trim(), password)
        resetForm()
        closeAuthModal()
      } else {
        if (!name.trim()) {
          showToast.warning('Full Name is required.')
          return
        }
        if (!email.trim()) {
          showToast.warning('Email address is required.')
          return
        }
        const normalizedEmail = normalizeEmail(email)
        const normalizedPhone = normalizeMobile(phone)
        const contactError = getContactError(normalizedEmail, normalizedPhone)
        if (contactError) {
          showToast.warning(contactError!)
          return
        }
        if (!password) {
          showToast.warning('Password is required.')
          return
        }
        if (password.length < 8) {
          showToast.warning('Password must be at least 8 characters long.')
          return
        }
        if (password !== confirmPassword) {
          showToast.error('Passwords do not match. Please verify your confirm password.')
          return
        }
        const normalizedUsername = normalizeUsername(username)
        const usernameError = getUsernameError(normalizedUsername)
        if (usernameError) {
          showToast.warning(usernameError!)
          return
        }
        if (!rollNo.trim()) {
          showToast.warning('Student Roll Number is required.')
          return
        }
        if (branch === 'OTHER' && !customDepartment.trim()) {
          showToast.warning('Please specify your custom department name.')
          return
        }
        if (!semester.trim()) {
          showToast.warning('Please select your current academic stage.')
          return
        }
        setIsSubmitting(true)
        await registerStudent({
          fullName: name.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          password,
          phone: normalizedPhone,
          rollNumber: rollNo.trim(),
          department: branch.trim(),
          customDepartment: branch === 'OTHER' ? customDepartment.trim() : undefined,
          semester: semester.trim(),
        })
        resetForm()
        closeAuthModal()
      }
    } catch (err: any) {
      if (err instanceof Error || (err && err.message)) {
        const msg = err.message || ''
        if (authModalMode === 'register') {
          if (msg.toLowerCase().includes('roll') || msg.toLowerCase().includes('idx_rollnumber')) {
            showToast.error('A student with this Roll Number is already registered.')
          } else if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('user_already_exists')) {
            showToast.error('An account with this email address already exists. Try signing in.')
          } else {
            showToast.error(msg)
          }
        } else {
          if (
            msg.toLowerCase().includes('invalid credentials') ||
            msg.toLowerCase().includes('invalid email') ||
            msg.toLowerCase().includes('invalid password') ||
            msg.toLowerCase().includes('user_invalid_credentials')
          ) {
            showToast.error('Invalid credentials. Please verify your email / username and password.')
          } else {
            showToast.error(msg)
          }
        }
      } else {
        showToast.error('Authentication failed. Please check credentials.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeAuthModal}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-md overflow-hidden border border-white/10 bg-[#080A0F] shadow-[0_25px_60px_rgba(0,0,0,0.85)]"
        >
          {/* Cyber accents */}
          <div className="pointer-events-none absolute inset-0">
            <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-[#00E5FF]" />
            <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-[#FF6B00]" />
            <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-[#FF6B00]" />
            <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-[#00E5FF]" />
            <div className="h-0.5 w-full bg-gradient-to-r from-[#00E5FF] via-white/20 to-[#FF6B00]" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00E5FF]">
                [AUTH // PROTOCOL]
              </span>
              <h2 className="mt-1 text-xl font-black uppercase tracking-tight text-white">
                {authModalMode === 'login' ? 'Sign In' : 'Create Identity Pass'}
              </h2>
            </div>

            <button
              onClick={closeAuthModal}
              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab switch */}
          <div className="grid grid-cols-2 border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.18em]">
            <button
              type="button"
              onClick={() => {
                openAuthModal('login')
                resetForm()
              }}
              className={`py-3 text-center transition-colors ${
                authModalMode === 'login'
                  ? 'border-b-2 border-[#00E5FF] bg-white/[0.03] font-bold text-[#00E5FF]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                openAuthModal('register')
                resetForm()
              }}
              className={`py-3 text-center transition-colors ${
                authModalMode === 'register'
                  ? 'border-b-2 border-[#FF6B00] bg-white/[0.03] font-bold text-[#FF6B00]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <div className="max-h-[75vh] overflow-y-auto p-6">
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
              {authModalMode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Full Name *
                      </label>
                      <div className="relative mt-1">
                        <User size={15} className="absolute left-3.5 top-3 text-slate-500" />
                        <input
                          type="text"
                          required
                          placeholder="Enter your full name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full border border-white/10 bg-[#050816] py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Username *
                      </label>
                      <div className="relative mt-1">
                        <AtSign size={15} className="absolute left-3.5 top-3 text-slate-500" />
                        <input
                          type="text"
                          required
                          maxLength={30}
                          pattern="[a-zA-Z0-9._]+"
                          autoCapitalize="none"
                          placeholder="letters, numbers, . and _ only"
                          value={username}
                          onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                          className="w-full border border-white/10 bg-[#050816] py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                        />
                      </div>
                      <p className="mt-1 font-mono text-[9px] text-slate-500">1–30 characters: lowercase letters, numbers, periods, or underscores.</p>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                  {authModalMode === 'login' ? 'Email, Username, or Roll Number *' : 'Email Address *'}
                </label>
                <div className="relative mt-1">
                  <Mail size={15} className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type={authModalMode === 'login' ? 'text' : 'email'}
                    required
                    inputMode={authModalMode === 'login' ? 'text' : 'email'}
                    autoCapitalize="none"
                    autoComplete={authModalMode === 'login' ? 'username' : 'email'}
                    placeholder={
                      authModalMode === 'login'
                        ? 'Email, @username, or roll number'
                        : 'name@example.com'
                    }
                    value={email}
                    onChange={(e) => setEmail(authModalMode === 'register' ? normalizeEmail(e.target.value) : e.target.value)}
                    className="w-full border border-white/10 bg-[#050816] py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                  Password *
                </label>
                <div className="relative mt-1">
                  <Lock size={15} className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-white/10 bg-[#050816] py-2.5 pl-10 pr-10 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-[#00E5FF] transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {authModalMode === 'register' && (
                <>
                  <div>
                    <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                      Confirm Password *
                    </label>
                    <div className="relative mt-1">
                      <Lock size={15} className="absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value)
                        }}
                        className="w-full border border-white/10 bg-[#050816] py-2.5 pl-10 pr-10 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-[#00E5FF] transition-colors"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Roll Number *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Enter student roll number"
                        value={rollNo}
                        onChange={(e) => setRollNo(e.target.value)}
                        className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#FF6B00]"
                      />
                    </div>

                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Phone / WhatsApp *
                      </label>
                      <div className="relative mt-1">
                        <Phone size={14} className="absolute left-3 top-3 text-slate-500" />
                        <input
                          type="tel"
                          required
                          inputMode="numeric"
                          autoComplete="tel-national"
                          pattern="[6-9][0-9]{9}"
                          maxLength={10}
                          placeholder="10-digit Indian mobile number"
                          value={phone}
                          onChange={(e) => setPhone(normalizeMobile(e.target.value))}
                          className="w-full border border-white/10 bg-[#050816] py-2.5 pl-9 pr-3 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#FF6B00]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Department / Branch *
                      </label>
                      <select
                        required
                        value={branch}
                        onChange={(e) => {
                          setBranch(e.target.value)
                          if (e.target.value !== 'OTHER') {
                            setCustomDepartment('')
                          }
                        }}
                        className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2.5 text-xs text-white outline-none transition-colors focus:border-[#00E5FF]"
                      >
                        <option value="" disabled className="bg-[#080A0F] text-slate-500">
                          Select Department
                        </option>
                        {DEPARTMENT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-[#080A0F] text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-slate-400">
                        Current academic stage *
                      </label>
                      <select
                        required
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="mt-1 w-full border border-white/10 bg-[#050816] px-3 py-2.5 text-xs text-white outline-none transition-colors focus:border-[#FF6B00]"
                      >
                        <option value="" className="bg-[#080A0F] text-slate-500">
                          Select semester, year, or course stage
                        </option>
                        {SEMESTER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-[#080A0F] text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {branch === 'OTHER' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="block font-mono text-[9px] uppercase tracking-[0.18em] text-[#00E5FF]">
                        Specify Custom Department * (Max 128 characters)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={128}
                        value={customDepartment}
                        onChange={(e) => setCustomDepartment(e.target.value)}
                        placeholder="Enter your department name"
                        className="mt-1 w-full border border-[#00E5FF]/50 bg-[#050816] px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]"
                      />
                    </motion.div>
                  )}
                </>
              )}
            </div>

              {/* Emergency Security Notice */}
              <div className="mt-4 flex items-center gap-2 border border-red-500/50 bg-red-950/40 p-3 text-xs text-red-400">
                <ShieldAlert size={16} className="shrink-0" />
                <span>
                  Portal access and account sessions are temporarily disabled due to emergency backend security maintenance.
                </span>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || true}
                className="mt-4 flex w-full items-center justify-center gap-2 border border-red-500/50 bg-red-950/40 py-3 text-xs font-black uppercase tracking-[0.18em] text-red-400 cursor-not-allowed opacity-80 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
              >
                <ShieldAlert size={16} />
                <span>Portal Closed / Maintenance</span>
              </button>
            </form>
          </div>
      </motion.div>
    </div>
  </AnimatePresence>
)
}
