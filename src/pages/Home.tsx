import { motion, useReducedMotion } from 'framer-motion'
import logo from '../assets/images/logo.png'
import {
  FaCode,
  FaGamepad,
  FaQuestionCircle,
  FaLightbulb,
} from 'react-icons/fa';
import { useEffect } from 'react';
const images = import.meta.glob(
  '../assets/images/*',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>

// ============================================================
// ANIMATION PRESETS
// ============================================================

const leftReveal = {
  hidden: {
    opacity: 0,
    x: -120,
    y: 45,
    rotate: -2,
    scale: 0.94,
  },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    rotate: -1,
    scale: 1,
  },
}

const rightReveal = {
  hidden: {
    opacity: 0,
    x: 120,
    y: 45,
    rotate: 2,
    scale: 0.94,
  },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 1,
    scale: 1,
  },
}

const depthReveal = {
  hidden: {
    opacity: 0,
    y: 100,
    scale: 0.88,
    rotateX: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
  },
}

// ============================================================
// MESSAGE CARDS
// ============================================================

const messageCards = [
  {
    title: "Hon'ble Vice-Chancellor's Message",
    text: 'It gives me immense pleasure to extend my best wishes on the occasion of Yantrotsav at Central University of Jammu. This event celebrates technology, innovation, creativity, and the talent of our young minds. I hope Yantrotsav inspires students to explore, innovate, and transform ideas into meaningful solutions. I congratulate the organizers and wish the event great success.',
    text1: 'Prof. Dr. Sanjeev Jain',
    text2: "Hon'ble Vice Chancellor",
    image: 'vc.jpg',
  },
  {
    title: 'Message from the HOD',
    text: 'Yantrotsav is a celebration of the curiosity, creativity, and technical spirit of our students. It is an opportunity to step beyond the classroom, experiment with ideas, and turn knowledge into practical solutions. I encourage every participant to embrace the challenges, learn through collaboration, and enjoy the process of innovation. My best wishes to all the students and the organizing team for a memorable and successful Yantrotsav.',
    text1: 'Dr. Dinesh Kumar',
    text2: 'Head of Department(CSE)',
    image: 'DRDINESHCSE.jpeg',
  },
]

// ============================================================
// FEATURE CARDS
// ============================================================

const featureCards = [
  {
    title: 'Dr. Jasvinder Pal Singh',
    text: 'Assistant Professor',
    image: 'JPsir.jpeg',
    accent: 'cyan',
  },
  {
    title: 'Dr. Harnain Kour',
    text: 'Assistant Professor',
    image: 'Harnain_Kour.jpeg',
    accent: 'violet',
  },
  {
    title: 'Dr. Gourav Kumar',
    text: 'Assistant Professor',
    image: 'Gourav_Kumar.jpeg',
    accent: 'orange',
  },
  {
    title: 'Mr. Zakir Ahmad Sheikh',
    text: 'Assistant Professor',
    image: 'zakirsir.jpeg',
    accent: 'cyan',
  },
  {
    title: 'Dr. Suresh Vishnudas Limkar',
    text: 'Assistant Professor',
    image: 'Limkarsir.jpg',
    accent: 'violet',
  },
  {
    title: 'Mr. Arun Kumar Sharma',
    text: 'Assistant Professor',
    image: 'Arun_Kumar_Sharma.png',
    accent: 'orange',
  }
]

// ============================================================
// HOME
// ============================================================

function Home() {
  const shouldReduceMotion = useReducedMotion()

  const revealTransition = {
    duration: shouldReduceMotion ? 0 : 0.85,
    ease: [0.22, 1, 0.36, 1] as const,
  }
  useEffect(() => {
    document.title = 'YANTROTSAV | Home'
  }, [])
  return (
    <div className="min-h-screen overflow-hidden bg-[#050816] text-white">


      <section className="relative w-full overflow-hidden  border-y border-white/10 bg-[#050816] pb-12  md:pb-16">
        {/* Ambient Cyberpunk Glows */}
        <div className="pointer-events-none absolute -left-40 top-1/4 h-96 w-96 rounded-full bg-[#00E5FF]/10 blur-[120px]" />
        <div className="pointer-events-none absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-[#FF6B00]/10 blur-[120px]" />

        <div className="relative mx-auto mt-26 max-w-[1400px] px-5 md:px-8">
          {/* ========================================================= */}
          {/* OFFICIAL ANNOUNCEMENT MARQUEE BANNER: REGISTRATIONS CLOSED */}
          {/* ========================================================= */}
          <div className="relative mb-8 sm:mb-12 overflow-hidden border border-[#FF6B00]/40 bg-gradient-to-r from-[#FF6B00]/10 via-[#050816] to-[#00E5FF]/10 p-2.5 sm:p-3.5 shadow-[0_0_30px_rgba(255,107,0,0.15)] backdrop-blur-md">
            {/* Cyberpunk corner brackets */}
            <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[#FF6B00]" />
            <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[#FF6B00]" />
            <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[#00E5FF]" />
            <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[#00E5FF]" />

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
              {/* Status Badge */}
              <div className="flex shrink-0 items-center gap-2 border border-[#FF6B00] bg-[#FF6B00]/20 px-3.5 py-1.5 font-mono text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#FF6B00] shadow-[0_0_15px_rgba(255,107,0,0.3)]">
                <span className="h-2 w-2 rounded-full bg-[#FF6B00] animate-pulse shrink-0" />
                <span>ANNOUNCEMENT</span>
              </div>

              {/* Scrolling Marquee */}
              <div className="relative w-full flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_3%,black_97%,transparent)]">
                <div className="animate-cyber-marquee whitespace-nowrap py-1">
                  {[...Array(2)].map((_, idx) => (
                    <div key={idx} className="flex items-center gap-8 pr-8 font-mono text-xs sm:text-sm tracking-[0.14em]">
                      <span className="text-[#00E5FF] font-bold uppercase tracking-[0.18em] flex items-center gap-2">
                        Online Registrations Are Officially Closed
                      </span>
                      <span className="text-[#FF6B00] font-black">///</span>
                      <span className="text-white font-semibold">
                        No Further Registrations Will Be Entertained
                      </span>
                      <span className="text-[#FF6B00] font-black">///</span>
                      <span className="text-slate-300">
                        For Official Queries, Please Contact the Organising Team
                      </span>
                      <span className="text-[#FF6B00] font-black">///</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Two-Column Hero Showcase */}
          <div className="grid items-center gap-12 mb-6 lg:grid-cols-12 lg:gap-16">
            {/* Left Column: Heading, Tagline, Story & Stats (7 cols) */}
            <motion.div
              initial={{ opacity: 0, y: 35 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="lg:relative lg:top-8 lg:col-span-7"
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#FF6B00]">
                1.1 / About The Event
              </span>
              <h2 className="text-4xl font-black uppercase tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
                YANTROTSAV <span className="text-[#00E5FF]">2026</span>
              </h2>

              {/* Closed Status Pill */}
              <div className="mt-4 inline-flex items-center gap-2 border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3.5 py-1.5 font-mono text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] text-[#FF6B00]">
                <span className="h-2 w-2 rounded-full bg-[#FF6B00]" />
                <span>Online Registrations Closed</span>
              </div>

              <div className="mt-4 flex items-center gap-3 sm:mt-6">
                <span className="h-2 w-2 rounded-full bg-[#FF6B00]" />
                <p className="text-base sm:text-lg font-medium tracking-[0.2em] uppercase text-slate-300">
                  <i>Where Tech Meets Innovation</i>
                </p>
              </div>

              <p className="mt-7 text-base leading-relaxed text-slate-400 sm:text-lg">
                <strong className="text-white font-semibold">
                  YANTROTSAV 2026
                </strong>{" "}
                is the premier university-level technology fest organised by the
                Department of Computer Science &amp; Engineering, Central
                University of Jammu, held in grand celebration of Engineers'
                Day.
              </p>

              <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">
                Bringing together brightest minds, developers, creators, and
                innovators from across the departments to compete, collaborate, and
                push the boundaries of technical prowess, algorithmic thinking,
                and creative problem-solving.
              </p>

              {/* Highlights Pill Badges */}
              <div className="mt-8 flex flex-wrap gap-2.5">
                <span className="border flex flex-col items-center justify-center border-[#00E5FF]/40 bg-[#00E5FF]/5 px-3 py-1 font-mono rounded-2xl text-[11px] font-bold uppercase tracking-wider text-[#00E5FF]">
                  <p><FaCode size={32} /></p>
                  <p>• Coding</p>
                </span>
                <span className="border flex flex-col items-center justify-center border-[#00E5FF]/40 bg-[#00E5FF]/5 px-3 py-1 font-mono rounded-2xl text-[11px] font-bold uppercase tracking-wider text-[#00E5FF]">
                  <FaGamepad size={32} />
                  <p>• Esports</p>
                </span>
                <span className="border flex flex-col items-center justify-center border-[#00E5FF]/40 bg-[#00E5FF]/5 px-3 py-1 font-mono rounded-2xl text-[11px] font-bold uppercase tracking-wider text-[#00E5FF]">
                  <p><FaQuestionCircle size={32} /></p>
                  <p>• Quizzes</p>
                </span>
                <span className="border flex flex-col items-center justify-center border-[#00E5FF]/40 bg-[#00E5FF]/5 px-3 py-1 font-mono rounded-2xl text-[11px] font-bold uppercase tracking-wider text-[#00E5FF]">
                  <p><FaLightbulb size={32} /></p>
                  • Ideathon & Presentation
                </span>
              </div>


            </motion.div>

            {/* Right Column: Interactive Cyber Emblem (5 cols) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex items-center justify-center lg:col-span-5"
            >
              <div className="group relative w-full max-w-md border border-white/10 bg-[#080A0F]/80 p-6 mt-16 shadow-2xl backdrop-blur-md transition duration-500 ease-out hover:-translate-y-2 hover:scale-[1.02] hover:border-[#00E5FF]/40 hover:shadow-[0_24px_60px_rgba(0,229,255,0.18)]">
                {/* Sci-Fi Decorative Corner Brackets */}
                <span className="absolute -left-2 -top-2 h-6 w-6 border-l-2 border-t-2 border-[#00E5FF]" />
                <span className="absolute -right-2 -top-2 h-6 w-6 border-r-2 border-t-2 border-[#FF6B00]" />
                <span className="absolute -bottom-2 -left-2 h-6 w-6 border-b-2 border-l-2 border-[#FF6B00]" />
                <span className="absolute -bottom-2 -right-2 h-6 w-6 border-b-2 border-r-2 border-[#00E5FF]" />

                {/* Emblem Halo Glow */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#00E5FF]/15 via-transparent to-[#FF6B00]/15" />

                <div className="relative z-10 flex flex-col items-center text-center">
                  <img
                    src={logo}
                    alt="Yantrotsav Official Fest Logo"
                    className="h-56 w-56 object-contain drop-shadow-[0_0_35px_rgba(0,229,255,0.4)] sm:h-64 sm:w-64"
                  />

                  <div className="mt-6 border-t border-white/10 pt-4 w-full">
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-white">
                      Central University of Jammu
                    </span>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      Dept. of Computer Science &amp; Engineering
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
      <div className="min-h-screen overflow-hidden bg-[#050816] text-white">
        {/* ======================================================
          MESSAGE HEADING
      ====================================================== */}
        <section className="mx-auto mt-6 flex max-w-[1400px] items-center justify-center px-5  md:px-8 md:pb-10">
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 70, scale: 0.92 }
            }
            whileInView={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            viewport={{
              once: true,
              amount: 0.25,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.8,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative border-b border-white/10 pb-7 text-center"
          >
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#FF6B00]">
              1.2 / The Message
            </span>

            <h2 className="mt-3 text-4xl font-black uppercase tracking-tight md:text-6xl">
              Words From The Visionaries
              <span className="visionary-dot ml-2 inline-block h-2 w-2 align-middle md:h-3 md:w-3" />
            </h2>

            <span className="absolute bottom-[-1px] left-1/2 h-px w-20 -translate-x-1/2 bg-[#00E5FF]" />
          </motion.div>
        </section>

        {/* ======================================================
          MESSAGE CARDS
      ====================================================== */}

        <section className="mx-auto max-w-[1400px] px-4 py-8 sm:px-5 md:px-8 md:py-12">
          <div className="space-y-20 md:space-y-[55px]">

            {messageCards.map((card, index) => {

              const animation =
                index === 0 ? leftReveal : rightReveal

              return (
                <motion.article
                  key={card.title}
                  variants={animation}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{
                    once: true,
                    amount: 0.12,
                  }}
                  transition={{
                    ...revealTransition,
                    delay: shouldReduceMotion ? 0 : index * 0.18,
                  }}
                  style={{
                    perspective: shouldReduceMotion ? 'none' : 1200,
                  }}
                  className={`relative w-full max-w-5xl ${index === 0
                    ? 'md:ml-[2%]'
                    : 'md:ml-auto md:mr-[2%]'
                    }`}
                >

                  <div className="absolute inset-2 translate-x-5 translate-y-5 bg-black/75 blur-[2px]" />

                  <span
                    className={`absolute -left-3 -top-3 z-0 h-0 w-0 border-b-[30px] border-r-[30px] border-b-transparent ${index === 0
                      ? 'border-r-[#00E5FF]/50'
                      : 'border-r-[#FF6B00]/50'
                      }`}
                  />

                  <span
                    className={`absolute -right-3 -top-3 z-0 h-0 w-0 border-b-[30px] border-l-[30px] border-b-transparent ${index === 0
                      ? 'border-l-[#FF6B00]/50'
                      : 'border-l-[#00E5FF]/50'
                      }`}
                  />

                  <span
                    className={`absolute -bottom-3 -left-3 z-0 h-0 w-0 border-t-[30px] border-r-[30px] border-t-transparent ${index === 0
                      ? 'border-r-[#FF6B00]/35'
                      : 'border-r-[#00E5FF]/35'
                      }`}
                  />

                  <span
                    className={`absolute -bottom-3 -right-3 z-0 h-0 w-0 border-t-[30px] border-l-[30px] border-t-transparent ${index === 0
                      ? 'border-l-[#00E5FF]/35'
                      : 'border-l-[#FF6B00]/35'
                      }`}
                  />

                  <div className="group relative z-10 grid overflow-hidden bg-[#080A0F] shadow-[0_18px_45px_rgba(0,0,0,0.4)] transition-all duration-500 hover:-translate-y-3 hover:shadow-[0_35px_80px_rgba(0,0,0,0.6)] md:grid-cols-[0.72fr_1.28fr]">

                    <div className="pointer-events-none absolute inset-0 z-40 border border-white/20" />

                    <div className="pointer-events-none absolute inset-[4px] z-40 border border-white/5" />

                    <span className="pointer-events-none absolute left-0 top-0 z-50 h-px w-36 bg-[#00E5FF]" />

                    <span className="pointer-events-none absolute bottom-0 right-0 z-50 h-px w-36 bg-[#FF6B00]" />

                    <span className="pointer-events-none absolute left-0 top-0 z-50 h-10 w-10 border-l-2 border-t-2 border-[#00E5FF]" />

                    <span className="pointer-events-none absolute right-0 top-0 z-50 h-7 w-7 border-r border-t border-white/30" />

                    <span className="pointer-events-none absolute bottom-0 left-0 z-50 h-7 w-7 border-b border-l border-white/30" />

                    <span className="pointer-events-none absolute bottom-0 right-0 z-50 h-10 w-10 border-b-2 border-r-2 border-[#FF6B00]" />

                    <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-br from-white/[0.045] via-transparent to-[#00E5FF]/[0.025]" />

                    {/* Image */}

                    <div className="relative flex min-h-[250px] flex-col items-center justify-center overflow-hidden bg-[#080A0F] p-6 sm:min-h-[280px] md:min-h-[300px]">

                      {card.image ? (
                        <motion.img
                          src={images[`../assets/images/${card.image}`]}
                          alt={card.title}
                          initial={{
                            opacity: 0,
                            scale: 0.75,
                            y: 40,
                          }}
                          whileInView={{
                            opacity: 1,
                            scale: 1,
                            y: 0,
                          }}
                          viewport={{
                            once: true,
                            amount: 0.25,
                          }}
                          transition={{
                            duration: shouldReduceMotion ? 0 : 0.8,
                            delay: shouldReduceMotion
                              ? 0
                              : index * 0.12 + 0.15,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="relative z-10 h-52 w-52 rounded-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105 sm:h-56 sm:w-56 md:h-64 md:w-64"
                        />
                      ) : (
                        <div className="relative z-10 flex min-h-[210px] w-full items-center justify-center border border-white/5">
                          <p>Image</p>
                        </div>
                      )}

                      <div className="relative z-10 text-center">
                        <p className="mt-4 text-base font-bold leading-7 sm:text-lg md:text-base">
                          {card.text1}
                        </p>

                        <p className="mt-1 text-base font-bold leading-7 sm:text-lg md:text-base">
                          {card.text2}
                        </p>
                      </div>

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#00E5FF]/10 via-transparent to-[#FF6B00]/10" />

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050816]/60 via-transparent to-transparent" />
                    </div>

                    {/* Text */}

                    <div className="relative z-30 flex flex-col justify-center p-6 sm:p-7 md:p-8">

                      <span className="mb-4 font-mono text-[9px] uppercase tracking-[0.25em] text-[#FF6B00]">
                        0{index + 1} / Message
                      </span>

                      <h2 className="max-w-2xl text-2xl font-black uppercase tracking-tight md:text-2xl lg:text-3xl">
                        {card.title}
                      </h2>

                      <div className="mt-5 flex items-center gap-3">
                        <span className="h-px w-12 bg-[#00E5FF] transition-all duration-500 group-hover:w-24" />

                        <span className="h-1 w-1 bg-[#FF6B00]" />
                      </div>

                      <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400 md:text-base md:leading-8">
                        {card.text}
                      </p>

                      <div className="mt-8 flex items-center gap-4">
                        <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-700">
                          Yantrotsav
                        </span>

                        <span className="h-px w-12 bg-white/10" />

                        <span className="font-mono text-[8px] text-slate-700">
                          2026
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.article>
              )
            })}
          </div>
        </section>

        {/* ======================================================
          WATCHER HEADING
      ====================================================== */}

        <section className="mx-auto mt-6 flex max-w-[1400px] items-center justify-center px-5 pb-8 md:px-8 md:pb-10">

          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 70, scale: 0.92 }
            }
            whileInView={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            viewport={{
              once: true,
              amount: 0.25,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.8,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="relative border-b border-white/10 pb-7 text-center"
          >

            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#FF6B00]">
              1.3 / The Watcher
            </span>

            <h2 className="mt-3 text-4xl font-black uppercase tracking-tight md:text-6xl">
              Our Convenors
            </h2>

            <span className="absolute bottom-[-1px] left-1/2 h-px w-20 -translate-x-1/2 bg-[#00E5FF]" />
          </motion.div>
        </section>

        {/* ======================================================
          WATCHER CARDS
      ====================================================== */}

        <section className="mx-auto max-w-[1400px] px-5 pb-16 md:px-8 md:pb-10">

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">

            {featureCards.map((card, index) => {

              const animation =
                index === 0
                  ? leftReveal
                  : index === 1
                    ? depthReveal
                    : rightReveal

              const accent =
                card.accent === 'cyan'
                  ? '#00E5FF'
                  : card.accent === 'orange'
                    ? '#FF6B00'
                    : '#7C3AED'

              return (
                <motion.article
                  key={card.title}
                  variants={animation}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{
                    once: true,
                    amount: 0.12,
                  }}
                  transition={{
                    duration: shouldReduceMotion ? 0 : 0.85,
                    delay: shouldReduceMotion ? 0 : index * 0.18,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    perspective: shouldReduceMotion ? 'none' : 1200,
                  }}
                  className="group relative"
                >

                  <div className="absolute inset-2 translate-x-4 translate-y-4 bg-black/70 blur-[1px]" />

                  <span
                    style={{
                      borderRightColor: `${accent}66`,
                    }}
                    className="absolute -left-2 -top-2 z-0 h-0 w-0 border-b-[22px] border-r-[22px] border-b-transparent"
                  />

                  <span
                    style={{
                      borderLeftColor: `${accent}44`,
                    }}
                    className="absolute -bottom-2 -right-2 z-0 h-0 w-0 border-t-[22px] border-l-[22px] border-t-transparent"
                  />

                  <div className="relative z-10 overflow-hidden bg-[#080A0F] shadow-[0_15px_35px_rgba(0,0,0,0.35)] transition-all duration-500 group-hover:-translate-y-3 group-hover:shadow-[0_30px_70px_rgba(0,0,0,0.55)]">

                    <div className="pointer-events-none absolute inset-0 z-40 border border-white/20" />

                    <div className="pointer-events-none absolute inset-[4px] z-40 border border-white/5" />

                    <span
                      style={{
                        backgroundColor: accent,
                      }}
                      className="absolute left-0 top-0 z-50 h-px w-28"
                    />

                    <span
                      style={{
                        borderColor: accent,
                      }}
                      className="absolute left-0 top-0 z-50 h-8 w-8 border-l-2 border-t-2"
                    />

                    <span
                      style={{
                        borderColor: accent,
                      }}
                      className="absolute bottom-0 right-0 z-50 h-8 w-8 border-b-2 border-r-2"
                    />

                    <div className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-br from-white/[0.04] via-transparent to-white/[0.01]" />

                    {/* Image */}

                    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#080A0F] p-5">

                      {card.image ? (
                        <motion.img
                          src={images[`../assets/images/${card.image}`]}
                          alt={card.title}
                          initial={{
                            opacity: 0,
                            scale: 0.82,
                            y: 45,
                          }}
                          whileInView={{
                            opacity: 1,
                            scale: 1,
                            y: 0,
                          }}
                          viewport={{
                            once: true,
                            amount: 0.2,
                          }}
                          transition={{
                            duration: shouldReduceMotion ? 0 : 0.8,
                            delay: shouldReduceMotion
                              ? 0
                              : index * 0.15 + 0.1,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="relative z-10 h-64 w-64 rounded-full object-contain object-center transition-transform duration-700 ease-out group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center border border-white/5">
                          <div className="text-center">

                            <span
                              style={{
                                color: accent,
                              }}
                              className="font-mono text-[9px] uppercase tracking-[0.2em]"
                            >
                              Feature 0{index + 1}
                            </span>

                            <p className="mt-2 text-[8px] uppercase tracking-[0.15em] text-slate-700">
                              Add image filename
                            </p>
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          background: `linear-gradient(135deg, ${accent}18, transparent 50%, ${accent}12)`,
                        }}
                        className="pointer-events-none absolute inset-0"
                      />

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#050816]/80 via-transparent to-transparent" />


                    </div>

                    {/* Content */}

                    <div className="relative z-20 p-6 md:p-7">

                      <div className="flex items-center justify-between">

                        <span
                          style={{
                            color: accent,
                          }}
                          className="font-mono text-[9px]"
                        >
                          0{index + 1}
                        </span>

                        <span
                          style={{
                            color: accent,
                          }}
                          className="text-xs opacity-40 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
                        >
                          ↗
                        </span>
                      </div>

                      <h3 className="mt-5 text-xl font-black uppercase tracking-tight">
                        {card.title}
                      </h3>

                      <p className="mt-3 text-sm leading-6 text-slate-500">
                        {card.text}
                      </p>

                      <div className="mt-6 flex items-center gap-2">

                        <span
                          style={{
                            backgroundColor: accent,
                          }}
                          className="h-px w-8 transition-all duration-500 group-hover:w-16"
                        />

                        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-700">
                          Dept. of Computer Science and Engineering
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.article>
              )
            })}
          </div>
        </section>
      </div>
      )
    </div>)
}

export default Home