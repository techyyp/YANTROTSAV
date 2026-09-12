import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, User, LogOut, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import logo from "../../assets/images/logo.png";
function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const { user, profile, isAdmin, logout } = useAuth()

  const closeMenu = () => setIsOpen(false)

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Events', path: '/events' },
    { name: 'Our Team', path: '/OurTeam' },
    { name: 'Contact', path: '/contact' },
    ...(user ? [{ name: 'Dashboard', path: '/dashboard' }] : []),
    ...(isAdmin ? [{ name: 'Admin', path: '/admin' }] : []),
  ]


  return (
    <motion.header
      initial={{
        opacity: 0,
        y: -30,
        filter: 'blur(8px)',
      }}
      animate={{
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
      }}
      transition={{
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <nav className="relative mx-auto max-w-[1400px] bg-[#050816]/95 px-5 py-4 backdrop-blur-md md:px-8">
        {/* Main technical border */}
        <div className="pointer-events-none absolute inset-0 border-b border-white/10" />

        {/* Cyan top accent */}
        <span className="pointer-events-none absolute left-0 top-0 h-px w-32 bg-[#00E5FF]" />

        {/* Orange top accent */}
        <span className="pointer-events-none absolute right-0 top-0 h-px w-24 bg-[#FF6B00]" />

        {/* Corner details */}
        <span className="pointer-events-none absolute left-0 top-0 h-5 w-5 border-l-2 border-t-2 border-[#00E5FF]" />
        <span className="pointer-events-none absolute right-0 top-0 h-5 w-5 border-r-2 border-t-2 border-[#FF6B00]" />

        {/* Bottom technical accents */}
        <span className="pointer-events-none absolute bottom-0 left-0 h-1 w-1 bg-[#00E5FF]" />
        <span className="pointer-events-none absolute bottom-0 right-0 h-1 w-1 bg-[#FF6B00]" />

        <div className="relative z-10 flex items-center justify-between">
          {/* LOGO */}
          <Link to="/" onClick={closeMenu} className="group flex flex-col-3 items-center gap-4">
            <img
              src={logo}
              alt="Logo"
              className="h-16 w-16 object-contain"
            />
            <div className="flex flex-col items-center gap-2">
              <span className="text-lg font-black tracking-[0.18em] text-white transition-colors duration-300 group-hover:text-[#00E5FF] md:text-xl">
                YANTROTSAV 2026
              </span>
              <span className="hidden border-l border-white/15 pl-4 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 sm:block">
                <i>Where Tech Meets Innovation</i>
              </span>
            </div>
            <span className="h-1.5 w-1.5 bg-[#FF6B00] transition-all duration-300 group-hover:scale-150 group-hover:bg-[#00E5FF]" />


          </Link>

          {/* DESKTOP NAV */}
          <div className="hidden items-center gap-5 md:flex">
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.path

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="group relative flex items-center gap-2 py-2"
                >
                  <span
                    className={`font-mono text-[10px] transition-colors ${isActive ? 'text-[#FF6B00]' : 'text-slate-600 group-hover:text-[#00E5FF]'
                      }`}
                  >
                    0{index + 1}
                  </span>

                  <span
                    className={`text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      }`}
                  >
                    {item.name}
                  </span>

                  <span
                    className={`absolute -bottom-[17px] left-0 h-px bg-[#FF6B00] transition-all duration-300 ${isActive ? 'w-full' : 'w-0 group-hover:w-full'
                      }`}
                  />
                </Link>
              )
            })}
          </div>

          {/* AUTH CTA / PASS STATUS */}
          <div className="hidden items-center gap-4 lg:flex">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#00E5FF] transition-all hover:bg-[#00E5FF] hover:text-black"
                >
                  <User size={12} />
                  <span>@{profile?.userId || profile?.username || (profile?.fullName || user.name).split(' ')[0]}</span>
                </Link>

                <button
                  onClick={() => logout()}
                  title="Sign Out"
                  className="border border-white/10 p-1.5 text-slate-400 transition-colors hover:border-red-500/40 hover:text-red-400"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled
                className="flex items-center gap-2 border border-white/15 bg-white/5 px-3.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 cursor-not-allowed opacity-80"
              >
                <Lock size={12} />
                <span>Registrations Closed</span>
              </button>
            )}
          </div>

          {/* MOBILE BUTTON */}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
            className="border border-white/10 p-2 text-slate-300 transition-all duration-300 hover:border-[#00E5FF]/50 hover:text-[#00E5FF] md:hidden"
          >
            {isOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <motion.div
        initial={false}
        animate={{
          height: isOpen ? 'auto' : 0,
          opacity: isOpen ? 1 : 0,
        }}
        className="overflow-hidden border-b border-white/10 bg-[#050816]/98 backdrop-blur-md md:hidden"
      >
        <div className="relative px-5 py-5">
          <div className="pointer-events-none absolute inset-0 border-l border-r border-white/10" />

          <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-[#FF6B00]" />
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Navigation / Yantrotsav 2026
              </span>
            </div>

            {user && (
              <button
                onClick={() => {
                  logout()
                  closeMenu()
                }}
                className="font-mono text-[9px] text-red-400 hover:underline"
              >
                Sign Out
              </button>
            )}
          </div>

          <div className="flex flex-col">
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.path

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={closeMenu}
                  className={`group flex items-center justify-between border-b border-white/5 py-4 transition-colors ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[10px] text-[#FF6B00]">0{index + 1}</span>
                    <span className="text-sm font-bold uppercase tracking-[0.18em]">
                      {item.name}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-slate-600 group-hover:text-[#00E5FF]">
                    →
                  </span>
                </Link>
              )
            })}

            {!user && (
              <button
                type="button"
                disabled
                className="mt-5 flex w-full items-center justify-center gap-2 border border-white/15 bg-white/5 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-slate-400 cursor-not-allowed opacity-80"
              >
                <Lock size={14} />
                <span>Registrations Closed</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.header>
  )
}

export default Navbar