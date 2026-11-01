/* ============================================================================
 * dsh-startup-screen — 启动动画运行时（浏览器端，零依赖）
 * ----------------------------------------------------------------------------
 * 由 Host 半侧注入到 index.html，在 React 应用挂载之前接管首屏：
 *
 *   第一幕  黑幕 + DeepSeek 鲸鱼标识／"深度求索"／"DEEPSEEK"（字距收紧 + 扫光）
 *   过场    过曝洗白（黑 → 灰 → 暖白底板），对应参考片的硬切洗白
 *   第二幕  暖白"技术档案"底板：左上品牌块左→右擦出、右下 POWERED BY、进度条
 *   序列    需要访问许可 → 身份资料确认 → 接收访问需求 → 读取完毕 → 验证通过
 *           → 欢迎 <身份名称> 访问；每步中文大字 + 英文等宽字幕 + 底部长句日志
 *   交互    第 1、2 步等待用户确认（按钮 / Enter / 空格 / 点击），可跳过
 *   终幕    WELCOME TO / [DEEPSEEK HARNESS] / 鲸鱼标识，青红色散故障后揭幕
 *
 * 配置来自 window.__DSH_STARTUP__（Host 侧注入），也可用
 * window.__DSH_STARTUP_API__.replay() 重播。
 * ========================================================================== */
(function () {
  'use strict'

  if (window.__DSH_STARTUP_LOADED__) return
  window.__DSH_STARTUP_LOADED__ = true

  var ROOT_ID = 'dsh-startup-root'

  /* ── DeepSeek 官方鲸鱼标识（取自 DSH 自带 favicon.svg 的路径数据）──────── */
  var WHALE_PATH = "M508.749 317.399C516.777 287.314 508.991 253.884 485.389 230.282C461.788 206.681 428.36 198.895 398.273 206.923C376.231 184.928 343.39 174.956 311.148 183.596C278.906 192.234 255.45 217.292 247.36 247.361C217.291 255.451 192.233 278.91 183.595 311.149C174.957 343.391 184.927 376.232 206.924 398.274C198.896 428.359 206.683 461.789 230.284 485.391C253.885 508.992 287.313 516.779 317.401 508.75C339.442 530.745 372.286 540.717 404.525 532.079C436.767 523.441 460.223 498.384 468.313 468.315C498.383 460.224 523.44 436.766 532.078 404.526C540.716 372.285 530.747 339.443 508.749 317.402V317.399ZM470.899 244.776C486.892 260.77 493.488 282.601 490.687 303.412L415.577 260.046C412.411 258.218 408.509 258.218 405.345 260.046L317.401 310.82V277.526C317.401 275.191 318.652 273.005 320.676 271.837L387.644 233.174C414.178 218.353 448.346 222.223 470.901 244.776H470.899ZM357.837 311.144L398.275 334.491V381.185L357.837 404.532L317.398 381.185V334.491L357.837 311.144ZM264.776 269.693C265.207 239.305 285.644 211.649 316.453 203.393C338.3 197.54 360.505 202.744 377.127 215.573L302.014 258.937C298.848 260.764 296.898 264.144 296.898 267.798V369.346L268.065 352.699C266.043 351.531 264.776 349.353 264.776 347.017V269.691V269.693ZM203.391 316.454C209.244 294.608 224.854 277.978 244.276 269.999V356.73C244.276 360.384 246.226 363.763 249.392 365.591L337.337 416.365L308.503 433.013C306.481 434.181 303.961 434.188 301.939 433.02L234.971 394.357C208.868 378.789 195.138 347.261 203.391 316.454ZM244.775 470.9C228.781 454.906 222.186 433.075 224.986 412.264L300.096 455.63C303.263 457.457 307.164 457.457 310.328 455.63L398.273 404.856V438.149C398.273 440.485 397.022 442.671 394.997 443.839L328.029 482.502C301.495 497.322 267.327 493.452 244.772 470.9H244.775ZM450.897 445.982C450.466 476.371 430.029 504.027 399.22 512.283C377.373 518.136 355.168 512.932 338.547 500.102L413.659 456.738C416.826 454.911 418.775 451.532 418.775 447.877V346.329L447.609 362.977C449.631 364.145 450.897 366.323 450.897 368.659V445.985V445.982ZM512.282 399.221C506.429 421.068 490.819 437.697 471.397 445.676V358.946C471.397 355.292 469.448 351.912 466.281 350.085L378.336 299.311L407.17 282.663C409.192 281.495 411.712 281.487 413.734 282.655L480.702 321.318C506.805 336.887 520.536 368.415 512.282 399.221Z"

  /* ── 默认配置（与 Host 侧 lib/index.js 的 DEFAULTS 保持一致）──────────── */
  var DEFAULTS = {
    enabled: true,
    mode: 'session',            // always | session | daily
    theme: 'light',             // light | dark
    speed: 1,
    requireInteraction: true,   // 第 1、2 步等待用户确认
    allowSkip: true,
    sound: true,                // 界面音效（WebAudio 合成，无音频文件）
    soundVolume: 0.5,
    voice: true,                // 女声播报
    voiceLang: 'en',            // en | zh | both
    voiceName: '',              // '' = 自动挑女声（见 FEMALE_HINTS）
    voiceRate: 0.88,            // 电影旁白档：比朗读慢，字与字之间才有重量
    voicePitch: 0.85,           // 压低音调，深沉的 AI 女声
    voiceVolume: 0.9,
    voiceCue: true,             // 念台词前的一声轻提示
    sfx: 'audio',               // audio=真素材（用户音频里抠的音效）/ synth=现场合成
    voiceSource: 'asset',       // asset=优先用真声素材 / tts=全部 TTS 合成
    voiceLead: 240,             // 提示音之后留一小段空白再开口
    identity: 'JOYCE MOORE',    // ← 设置页可改的"身份名称"
    identityId: '0087',
    accessLevel: '3',
    brand1: 'OPENAI',
    brand2: 'SYNTHESIZE INTELLIGENCE',
    brand3a: 'CODEX',
    brand3b: 'OS',
    orgZh: 'OpenAI',
    orgEn: 'CODEX',
    orgSub: 'OPENAI CODEX',
    welcomeBox: 'CODEX',
    footer: 'POWERED BY OPENAI',
    accent: '#ff7500',
    glitchA: '#ff3b30',
    glitchB: '#2971b8'
  }

  /* ── 序列脚本：中文主字 + 英文等宽字幕 + 底部日志 ───────────────────────
     `say` 是专门给语音播报用的自然语句（照着参考片里女声念状态行的节奏，
     正好卡在各自文字出现的时间点上）。 */
  /* ── 序列脚本 ──────────────────────────────────────────────────────────
     文字与真声素材一一对应（来自你给的音频）：
       line-1.mp3 = V1 需要访问许可
       line-2.mp3 = V2 身份资料确认
       line-3.mp3 = V4 接收访问需求
       line-4.mp3 = V5 开始读取权限
       line-5.mp3 = V6 读取完毕 · 核验通过
     V3 是用户名字独白，按你的要求不用。
     `say` 是素材拿不到时的 TTS 兜底文本；`audio` 是素材文件名（不含扩展名）。 */
  var STEPS = [
    {
      zh: '需要访问许可',
      en: 'ACCESS PERMISSION REQUIRED',
      say: 'Access permission required.',
      audio: 'line-1',
      log: '等待用户授权…',
      logEn: 'AWAITING OPERATOR CONSENT',
      badge: 'AUTHORIZATION',
      action: 'grant',
      btnZh: '授予访问权限',
      btnEn: 'GRANT ACCESS',
      hold: 900,
      progress: 0.34
    },
    {
      zh: '身份资料确认',
      en: 'IDENTITY VERIFICATION',
      say: 'Identity verification.',
      audio: 'line-2',
      log: '核对身份资料…',
      logEn: 'MATCHING OPERATOR RECORD',
      badge: 'IDENTITY',
      action: 'confirm',
      btnZh: '确认身份',
      btnEn: 'CONFIRM IDENTITY',
      hold: 700,
      progress: 0.5
    },
    {
      zh: '接收访问需求',
      en: 'ACCESS REQUEST RECEIVED',
      say: 'Access request received.',
      audio: 'line-3',
      log: '接收访问需求，建立会话通道…',
      logEn: 'HANDSHAKE ESTABLISHED',
      badge: 'REQUEST',
      action: 'auto',
      hold: 1200,
      progress: 0.66,
      assembleLogo: true
    },
    {
      zh: '开始读取权限',
      en: 'PERMISSION READ STARTED',
      say: 'Beginning permission read.',
      audio: 'line-4',
      log: '开始读取权限，索引工作区与会话…',
      logEn: 'READING PERMISSION SET',
      badge: 'READ',
      action: 'auto',
      hold: 1200,
      progress: 0.8,
      hex: true
    },
    {
      zh: '读取完毕 · 核验通过',
      en: 'READ COMPLETE · VERIFIED',
      say: 'Read complete. Verification passed.',
      audio: 'line-5',
      log: '读取完毕，核验通过，权限已授予',
      logEn: 'PERMISSION AUTHORIZED',
      badge: 'VERIFY',
      action: 'auto',
      hold: 1600,
      progress: 0.93,
      reticle: true
    }
  ]

  function cfg() {
    var raw = (window.__DSH_STARTUP__ && typeof window.__DSH_STARTUP__ === 'object')
      ? window.__DSH_STARTUP__
      : {}
    var out = {}
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) out[k] = DEFAULTS[k]
    for (var k2 in raw) {
      if (Object.prototype.hasOwnProperty.call(raw, k2) && raw[k2] !== undefined && raw[k2] !== null) {
        out[k2] = raw[k2]
      }
    }
    out.speed = Math.min(3, Math.max(0.35, Number(out.speed) || 1))
    out.identity = String(out.identity || DEFAULTS.identity).slice(0, 48)
    /* 代号取身份名称里的字母数字；纯中文名字取不到时退回 OPERATOR */
    out.identityId = String(out.identityId || out.identity).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    if (!out.identityId) out.identityId = 'OPERATOR'
    return out
  }

  var C = cfg()

  /* ── 桌面端标题栏同步（Windows · Windows Controls Overlay）─────────────────
     DeepSeek Harness Desktop 在 Windows 上用 titleBarOverlay 画最小化/最大化/关闭，
     底色跟随应用主题。于是启动动画播放时右上角会留一块与应用主题同色的方块：
     第一幕纯黑时是一条亮带，暖白底板阶段三个深色图标压在浅色块上，色差刺眼。
     这里把 preload 用来测色的隐藏探针改成完全透明，逼它发出
     setTitleBarOverlay({ color: rgba(0,0,0,0), symbolColor: rgba(0,0,0,0) })：
     overlay 与按钮图标一起消失，启动界面直接透上来，任何一幕都天然无缝。
     这正是桌面端欢迎窗自己的写法（titleBarOverlay.color 就是 '#00000000'）。
     探针的 var() 由最近一层声明解析，只改 <html> 上的 token 会被主题层遮蔽，
     所以主路径直改探针自身的内联样式，token 一并改当作双保险。
     揭幕 / 跳过 / 自举失败 / 9 秒兜底一律还原；浏览器与 macOS 下整段空转。
     任何一步失败都静默降级 —— 标题栏保持原样，动画绝不受影响。 */
  var chromeSync = (function () {
    var CLEAR = 'rgba(0, 0, 0, 0)'
    var VARS = ['--dsw-specific-sidebar-fill', '--dsw-alias-label-primary']
    var MAX_HOLD_MS = 60000          /* 硬上限：万一动画卡住，别把按钮永久藏住 */
    var rootEl = document.documentElement
    var state = { applied: false, probe: null, settledHits: 0 }
    var savedVars = {}
    var retryTimers = []
    var keepAlive = null
    var holdTimer = null

    function isDesktopWin() {
      try {
        var nav = (typeof window !== 'undefined' && window.navigator) ||
          (typeof navigator !== 'undefined' ? navigator : null)
        if (!nav || !/Win/.test(nav.userAgent || '')) return false
        /* 判据不只认协议字符串：桌面端还会在文档上打 data-windows-titlebar 标记，
           任一个命中即认为是 Windows 桌面端，避免协议改名后整段静默失效 */
        var loc = (typeof window !== 'undefined' && window.location) ||
          (typeof location !== 'undefined' ? location : null)
        if (loc && loc.protocol === 'dsh-app:') return true
        var de = document.documentElement
        return !!(de && de.hasAttribute && de.hasAttribute('data-windows-titlebar'))
      } catch (e) { return false }
    }

    /* preload 的探针是 span，内联 background-color 的声明值里带这个 token 名 */
    function findProbe() {
      try {
        if (!document.querySelector) return null
        var el = document.querySelector('span[style*="dsw-specific-sidebar-fill"]')
        if (el) return el
        /* 兜底：某些实现不把内联样式暴露给属性选择器 */
        if (!document.querySelectorAll) return null
        var spans = document.querySelectorAll('span')
        for (var i = 0; i < spans.length; i++) {
          var s = spans[i]
          if (!s.style || typeof s.style.getPropertyValue !== 'function') continue
          var bg = s.style.getPropertyValue('background-color')
          if (bg && bg.indexOf('--dsw-specific-sidebar-fill') !== -1) return s
        }
      } catch (e) { /* 兜底不再抛 */ }
      return null
    }

    /* preload 观察 head 的 childList 与 body 的 style；两条一起打，任一条生效即可 */
    function poke() {
      try {
        if (document.head) {
          var st = document.createElement('style')
          st.setAttribute('data-dsu-chrome-poke', '1')
          st.textContent = '/*dsu-poke*/'
          document.head.appendChild(st)
          if (st.parentNode) st.parentNode.removeChild(st)
        }
      } catch (e) { /* 兜底不再抛 */ }
      try {
        if (document.body && document.body.style) {
          document.body.style.setProperty('--dsu-chrome-poke', String(Date.now() % 1000000))
          document.body.style.removeProperty('--dsu-chrome-poke')
        }
      } catch (e) { /* 兜底不再抛 */ }
    }

    /** 探针是否已经真的透明了；拿不到计算样式就当作「未确认」，继续补打。 */
    function settled() {
      try {
        var p = state.probe
        if (!p || p.isConnected === false) return false
        if (typeof getComputedStyle !== 'function') return false
        return getComputedStyle(p).backgroundColor === CLEAR
      } catch (e) { return false }
    }

    function apply() {
      try {
        /* 探针可能被应用重挂（主题切换 / 热重载）：缓存节点一旦脱离文档就重找，
           否则会对着死节点空打，标题栏在动画中途突然回到主题色 */
        var probe = state.probe
        if (!probe || probe.isConnected === false) probe = state.probe = findProbe()
        if (probe) {
          probe.style.setProperty('background-color', CLEAR)
          probe.style.setProperty('color', CLEAR)
        }
        if (rootEl) for (var j = 0; j < VARS.length; j++) rootEl.style.setProperty(VARS[j], CLEAR)
        poke()
      } catch (e) { /* 兜底不再抛 */ }
    }

    function stopTimers() {
      for (var r = 0; r < retryTimers.length; r++) clearTimeout(retryTimers[r])
      retryTimers = []
      if (keepAlive) { clearInterval(keepAlive); keepAlive = null }
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
    }

    function hide() {
      if (!isDesktopWin()) return
      try {
        if (!state.applied) {
          state.applied = true
          state.settledHits = 0
          for (var i = 0; i < VARS.length; i++) savedVars[VARS[i]] = rootEl.style.getPropertyValue(VARS[i])
          state.probe = findProbe()
          /* 万一动画卡住不揭幕，到点强制还原，绝不把三个按钮永久藏住 */
          holdTimer = setTimeout(show, MAX_HOLD_MS)
        }
        apply()
        /* defer 注入路径下 splash.js 可能早于 preload 装探针：补打几次 */
        for (var r = 0; r < retryTimers.length; r++) clearTimeout(retryTimers[r])
        retryTimers = []
        var delays = [140, 520, 1400]
        for (var d = 0; d < delays.length; d++) retryTimers.push(setTimeout(apply, delays[d]))
        /* 自愈：应用挂载过程中若它自己重发（主题就绪）也拉回透明；
           已经连续两次确认透明就收手，别一直空打 IPC */
        if (!keepAlive) {
          keepAlive = setInterval(function () {
            if (!state.applied) return
            if (settled()) {
              if (++state.settledHits >= 2) { clearInterval(keepAlive); keepAlive = null }
              return
            }
            state.settledHits = 0
            apply()
          }, 600)
        }
      } catch (e) { /* 兜底不再抛 */ }
    }

    function show() {
      if (!state.applied) return
      state.applied = false
      try {
        stopTimers()
        var probe = state.probe
        if (probe) {
          probe.style.removeProperty('background-color')
          probe.style.removeProperty('color')
        }
        if (rootEl) {
          for (var k = 0; k < VARS.length; k++) {
            if (savedVars[VARS[k]]) rootEl.style.setProperty(VARS[k], savedVars[VARS[k]])
            else rootEl.style.removeProperty(VARS[k])
          }
        }
        poke()
        state.probe = null
        state.settledHits = 0
      } catch (e) { /* 兜底不再抛 */ }
    }

    /* 双保险：无论从哪条路退出（揭幕 / 跳过 / 自举失败 / 9 秒兜底），
       #dsh-startup-root 一被移除就还原标题栏 */
    var observerInstalled = false
    function installObserver() {
      if (observerInstalled) return
      observerInstalled = true
      try {
        if (typeof MutationObserver !== 'function' || !document.body) return
        var mo = new MutationObserver(function (muts) {
          for (var m = 0; m < muts.length; m++) {
            var nodes = muts[m].removedNodes
            for (var n = 0; nodes && n < nodes.length; n++) {
              if (nodes[n] && nodes[n].nodeType === 1 && nodes[n].id === ROOT_ID) { show(); return }
            }
          }
        })
        mo.observe(document.body, { childList: true })
      } catch (e) { /* 兜底不再抛 */ }
    }
    if (document.body) installObserver()
    else if (document.addEventListener) document.addEventListener('DOMContentLoaded', installObserver)

    return { hide: hide, show: show, isDesktopWin: isDesktopWin }
  })()

  /* 排查 / 冒烟测试用的把手：只读开关，不改变插件行为 */
  try { window.__DSH_STARTUP_CHROME__ = chromeSync } catch (e) { /* noop */ }

  /* 代际号：replay 会重新挂一份脚本，旧脚本的时间线必须立刻失效 */
  var GEN = (window.__DSH_STARTUP_GEN__ = (window.__DSH_STARTUP_GEN__ || 0) + 1)
  function stale() { return window.__DSH_STARTUP_GEN__ !== GEN }
  function noop() {}

  /* 停滞看门狗：任意一幕卡住（音频不 resolve / 音频设备切换 / 音频上下文被挂起）都要放行。
     每推进一幕重新上弦；等用户操作时 disarm，不把正在犹豫的人踢出去。 */
  var STALL_MS = 15000
  var stallTimer = null
  function disarmStall() {
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null }
  }
  function armStall() {
    disarmStall()
    stallTimer = setTimeout(function () {
      if (finished || stale()) return
      window.__DSH_STARTUP_STALLED__ = true
      try { console.warn('[dsh-startup-screen] 时间线停滞超过 ' + STALL_MS + 'ms，强制揭幕') } catch (e) { /* noop */ }
      finish()
    }, STALL_MS)
  }

  /** 拆掉当前实例：停时间线、清定时器、停语音、解滚动锁、摘根节点。replay 前必须先调它。 */
  function dispose() {
    finished = true
    disarmStall()
    try { releaseAll() } catch (e) { /* noop */ }
    try { stopHex() } catch (e) { /* noop */ }
    if (referenceScan) referenceScan.stop()
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null }
    try { voice.stop() } catch (e) { /* noop */ }
    try {
      document.documentElement.classList.remove('dsu-lock')
      document.documentElement.style.overflow = ''
      if (document.body) document.body.style.overflow = ''
    } catch (e) { /* noop */ }
    try {
      var r = document.getElementById(ROOT_ID)
      if (r && r.parentNode) r.parentNode.removeChild(r)
    } catch (e) { /* noop */ }
  }

  /** 重播：先拆旧实例（它整条 run() 链和定时器都还活着），再把运行时脚本重新挂一次。 */
  function injectSelf() {
    var prev = window.__DSH_STARTUP_API__
    if (prev && typeof prev.dispose === 'function' && prev.dispose !== noop) {
      try { prev.dispose() } catch (e) { /* 旧实例拆不干净也不能挡住重播 */ }
    }
    window.__DSH_STARTUP_LOADED__ = false
    var old = document.getElementById(ROOT_ID)
    if (old && old.parentNode) old.parentNode.removeChild(old)
    window.__DSH_STARTUP_SKIP__ = false
    var s = document.createElement('script')
    /* 正式运行时由 Host 路由提供（加时间戳绕开缓存）；
       离线预览页会把相对路径写进 __DSH_STARTUP_SCRIPT_URL__，file:// 下不加查询串。 */
    if (window.__DSH_STARTUP_SCRIPT_URL__) {
      s.src = window.__DSH_STARTUP_SCRIPT_URL__
    } else {
      s.src = '/dsh-startup/splash.js?t=' + Date.now()
    }
    document.head.appendChild(s)
  }

  /* Host 侧的首屏兜底脚本已经判定"这次不播"（未启用 / 本会话已播 / 今日已播）：
     这里不再建 DOM，但仍然暴露 API，方便设置页按需重播。 */
  if (window.__DSH_STARTUP_SKIP__ === true) {
    window.__DSH_STARTUP_API__ = {
      replay: injectSelf,
      skip: function () {},
      finish: function () {},
      dispose: noop,
      config: C
    }
    return
  }

  /* 最后一道保险：脚本连 run() 都没进去（404 / 语法错 / 被拦）时，9 秒后无条件放行。
     判的是「有没有开始跑」而不是类名 —— `dsu-boot` 在 run() 之前就被摘掉了，
     按类名判等于永不生效（这正是旧实现漏掉的那类卡死）。 */
  setTimeout(function () {
    try {
      if (window.__DSH_STARTUP_RUNNING__ === true) return
      var r = document.getElementById(ROOT_ID)
      if (r && r.parentNode) r.parentNode.removeChild(r)
      document.documentElement.classList.remove('dsu-lock')
      if (document.body) document.body.style.overflow = ''
      window.__DSH_STARTUP_FAILED__ = true
    } catch (e) { /* 兜底本身不许再抛 */ }
  }, 9000)

  /* ── 小工具 ───────────────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  function svgWhale(cls) {
    var ns = 'http://www.w3.org/2000/svg'
    var svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '175 175 366 366')
    svg.setAttribute('aria-hidden', 'true')
    if (cls) svg.setAttribute('class', cls)
    var p = document.createElementNS(ns, 'path')
    p.setAttribute('d', WHALE_PATH)
    p.setAttribute('fill-rule', 'nonzero')
    svg.appendChild(p)
    return svg
  }

  /** 逐字渐显：比逐字截断更稳（居中排版不会因为字宽变化而抖动） */
  function typeIn(host, text, stagger) {
    host.textContent = ''
    var frag = document.createDocumentFragment()
    var n = 0
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i)
      if (ch === ' ') {
        frag.appendChild(document.createTextNode('\u00a0'))
        continue
      }
      var s = el('span', 'dsu-ch', ch)
      s.style.transitionDelay = Math.round(n * stagger) + 'ms'
      frag.appendChild(s)
      n++
    }
    host.appendChild(frag)
  }

  function setIn(node, on, cls) {
    if (!node) return
    node.classList.toggle(cls || 'dsu-in', !!on)
  }

  /* ── DOM 搭建 ─────────────────────────────────────────────────────────── */
  var root = document.getElementById(ROOT_ID)
  if (!root) {
    root = el('div')
    root.id = ROOT_ID
    root.className = 'dsu-root'
    document.body.appendChild(root)
  }
  root.classList.toggle('dsu-dark', C.theme === 'dark')
  root.style.setProperty('--dsu-speed', String(C.speed))
  root.style.setProperty('--dsu-accent', C.accent)
  root.style.setProperty('--dsu-glitch-a', C.glitchA)
  root.style.setProperty('--dsu-glitch-b', C.glitchB)

  var ui = {}
  var clockTimer = null
  var html =
    '<div class="dsu-plate"></div>' +
    '<div class="dsu-vignette"></div>' +
    '<div class="dsu-watermark"></div>' +
    '<div class="dsu-grain"></div>' +
    '<div class="dsu-black">' +
      '<div class="dsu-black-inner"></div>' +
      '<div class="dsu-sweep"></div>' +
    '</div>' +
    '<div class="dsu-wash"></div>' +
    '<header class="dsu-brand">' +
      '<div class="dsu-brand-1"></div><div class="dsu-brand-2"></div>' +
      '<div class="dsu-brand-3"><b></b><span></span></div>' +
    '</header>' +
    '<div class="dsu-stepcount">[ 00 / 06 ] INIT</div>' +
    '<div class="dsu-center">' +
      '<div class="dsu-status"><span class="dsu-status-zh"></span><i class="dsu-caret"></i></div>' +
      '<div class="dsu-sub-en"></div>' +
      '<div class="dsu-rule"></div>' +
      '<div class="dsu-logo"></div>' +
      '<div class="dsu-dots" hidden></div>' +
    '</div>' +
    '<div class="dsu-sequence-logo" aria-hidden="true"></div>' +
    '<div class="dsu-idline"></div>' +
    '<div class="dsu-reticle"></div>' +
    '<div class="dsu-hex"></div>' +
    '<div class="dsu-welcome">' +
      '<div class="dsu-welcome-panel" aria-hidden="true"></div>' +
      '<div class="dsu-w1">WELCOME TO</div>' +
      '<div class="dsu-w2"><span class="dsu-w2-base"></span><span class="dsu-w2-highlight" aria-hidden="true"></span></div>' +
      '<div class="dsu-w4"></div>' +
      '<div class="dsu-w3"></div>' +
    '</div>' +
    '<div class="dsu-action">' +
      '<div class="dsu-card" hidden></div>' +
      '<button class="dsu-btn" type="button">' +
        '<span class="dsu-btn-zh"></span><span class="dsu-btn-en"></span>' +
      '</button>' +
      '<div class="dsu-hint"></div>' +
    '</div>' +
    '<div class="dsu-frame">' +
      '<i class="dsu-corner dsu-c-tl"></i><i class="dsu-corner dsu-c-tr"></i>' +
      '<i class="dsu-corner dsu-c-bl"></i><i class="dsu-corner dsu-c-br"></i>' +
      '<div class="dsu-scanline"></div>' +
    '</div>' +
    '<div class="dsu-slats"></div>' +
    '<div class="dsu-voice"><i></i><i></i><i></i><i></i><i></i></div>' +
    '<div class="dsu-meta"><span class="dsu-meta-1"></span><span class="dsu-meta-2"></span></div>' +
    '<div class="dsu-skip">SKIP ▸</div>' +
    '<footer class="dsu-foot"><span></span><i></i></footer>' +
    '<div class="dsu-subtitle">' +
      '<span class="dsu-sub-zh"></span><span class="dsu-sub-en2"></span>' +
    '</div>' +
    '<div class="dsu-progress"><i></i></div>' +
    '<div class="dsu-bloom"></div>' +
    '<div class="dsu-streak"></div>' +
    '<div class="dsu-flash"></div>'

  root.innerHTML = html

  function q(sel) { return root.querySelector(sel) }
  ui.plate = q('.dsu-plate')
  ui.watermark = q('.dsu-watermark')
  ui.black = q('.dsu-black')
  ui.blackInner = q('.dsu-black-inner')
  ui.sweep = q('.dsu-sweep')
  ui.wash = q('.dsu-wash')
  ui.flash = q('.dsu-flash')
  ui.bloom = q('.dsu-bloom')
  ui.streak = q('.dsu-streak')
  ui.vignette = q('.dsu-vignette')
  ui.brand = q('.dsu-brand')
  ui.center = q('.dsu-center')
  ui.brand1 = q('.dsu-brand-1')
  ui.brand2 = q('.dsu-brand-2')
  ui.brand3b = q('.dsu-brand-3 b')
  ui.brand3s = q('.dsu-brand-3 span')
  ui.stepcount = q('.dsu-stepcount')
  ui.status = q('.dsu-status')
  ui.statusZh = q('.dsu-status-zh')
  ui.caret = q('.dsu-caret')
  ui.subEn = q('.dsu-sub-en')
  ui.rule = q('.dsu-rule')
  ui.logo = q('.dsu-logo')
  ui.dots = q('.dsu-dots')
  ui.sequenceLogo = q('.dsu-sequence-logo')
  ui.idline = q('.dsu-idline')
  ui.reticle = q('.dsu-reticle')
  ui.hex = q('.dsu-hex')
  ui.welcome = q('.dsu-welcome')
  ui.w1 = q('.dsu-w1')
  ui.w2 = q('.dsu-w2')
  ui.w2Base = q('.dsu-w2-base')
  ui.w2Highlight = q('.dsu-w2-highlight')
  ui.w3 = q('.dsu-w3')
  ui.w4 = q('.dsu-w4')
  ui.action = q('.dsu-action')
  ui.card = q('.dsu-card')
  ui.btn = q('.dsu-btn')
  ui.btnZh = q('.dsu-btn-zh')
  ui.btnEn = q('.dsu-btn-en')
  ui.hint = q('.dsu-hint')
  ui.skip = q('.dsu-skip')
  ui.foot = q('.dsu-foot')
  ui.footText = q('.dsu-foot span')
  ui.subZh = q('.dsu-sub-zh')
  ui.subEn2 = q('.dsu-sub-en2')
  ui.progress = q('.dsu-progress')
  ui.bar = q('.dsu-progress i')
  ui.frame = q('.dsu-frame')
  ui.scanline = q('.dsu-scanline')
  ui.slats = q('.dsu-slats')
  ui.voice = q('.dsu-voice')
  ui.meta = q('.dsu-meta')
  ui.meta1 = q('.dsu-meta-1')
  ui.meta2 = q('.dsu-meta-2')

  /* 内容填充 */
  ui.brand1.textContent = C.brand1
  ui.brand2.textContent = C.brand2
  ui.brand3b.textContent = C.brand3a
  ui.brand3s.textContent = C.brand3b
  ui.footText.textContent = C.footer
  ui.w2Base.textContent = C.welcomeBox
  ui.w2Highlight.textContent = C.welcomeBox
  ui.w4.textContent = '欢迎 ---- 访问'
  ui.idline.textContent = '· ID CONFIRMED : ----'

  ;(function blackStage() {
    var inner = ui.blackInner
    var whale = svgWhale('dsu-whale')
    inner.appendChild(whale)
    inner.appendChild(el('div', 'dsu-black-zh', C.orgZh))
    var en = el('div', 'dsu-black-en', C.orgEn)
    inner.appendChild(en)
    inner.appendChild(el('div', 'dsu-black-sub', C.orgSub))
    ui.blackEn = en
  })()

  ;(function logoStage() {
    ui.logo.appendChild(svgWhale())
    ui.logo.appendChild(el('div', 'dsu-logolabel', 'O P E N A I'))
  })()

  ;(function sequenceLogo() {
    var icon = svgWhale()
    var ink = icon.querySelector('path')
    ink.setAttribute('class', 'dsu-sequence-ink')
    var trace = ink.cloneNode(false)
    trace.setAttribute('class', 'dsu-sequence-trace')
    trace.setAttribute('pathLength', '1')
    icon.appendChild(trace)
    ui.sequenceLogo.appendChild(icon)
    ui.sequenceLogo.appendChild(el('div', 'dsu-sequence-label', 'O P E N A I'))
  })()

  ;(function welcomeLogo() {
    var logo = svgWhale()
    var ink = logo.querySelector('path')
    ink.setAttribute('class', 'dsu-welcome-logo-ink')
    ;['red', 'blue'].forEach(function (color) {
      var ghost = ink.cloneNode(false)
      ghost.setAttribute('class', 'dsu-welcome-ghost dsu-welcome-ghost-' + color)
      logo.insertBefore(ghost, ink)
    })
    ui.w3.appendChild(logo)
    ui.w3.appendChild(el('span', 'dsu-w3label', 'O P E N A I  ·  C O D E X'))
  })()

  ;(function watermark() {
    var boxes = [
      [0.60, 0.02, 0.16, 0.96], [0.78, 0.02, 0.16, 0.96], [0.96, 0.02, 0.16, 0.96],
      [0.05, 0.02, 0.10, 0.5]
    ]
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i]
      var n = el('div', 'dsu-wm')
      n.style.left = (b[0] * 100) + '%'
      n.style.top = (b[1] * 100) + '%'
      n.style.width = (b[2] * 100) + '%'
      n.style.height = (b[3] * 100) + '%'
      ui.watermark.appendChild(n)
    }
  })()

  /* 左侧六格阶段柱 + 品牌块下方的小字数据行 + 实时时钟 */
  ;(function slatsAndMeta() {
    for (var i = 0; i < STEPS.length + 1; i++) ui.slats.appendChild(el('i', 'dsu-slat'))
    ui.meta1.textContent = 'REV 0.1.0 · WEB PROFILE'
    paintClock()
    clockTimer = setInterval(paintClock, 1000)
  })()

  ;(function reticle() {
    var ns = 'http://www.w3.org/2000/svg'
    var svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '0 0 400 400')
    function arc(cx, cy, r, a0, a1, cls, cap) {
      var rad = function (d) { return (d - 90) * Math.PI / 180 }
      var x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0))
      var x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1))
      var large = (a1 - a0) > 180 ? 1 : 0
      var p = document.createElementNS(ns, 'path')
      p.setAttribute('d', 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) +
        ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2))
      p.setAttribute('class', cls)
      if (cap) p.setAttribute('stroke-linecap', cap)
      return { node: p, x: x1, y: y1, x0: x0, y0: y0 }
    }
    var gA = document.createElementNS(ns, 'g')
    gA.setAttribute('class', 'dsu-ret-rot-a')
    /* 300° 弧，缺口留在正下方 6 点钟方向：底部字幕永远不会被压到，
       弧末端圆点落在 5 点钟位置，和原片一致。 */
    var a = arc(200, 200, 150, 215, 505, 'dsu-ring-a', 'round')
    gA.appendChild(a.node)
    var da = document.createElementNS(ns, 'circle')
    da.setAttribute('class', 'dsu-dot-a')
    da.setAttribute('cx', a.x.toFixed(2)); da.setAttribute('cy', a.y.toFixed(2)); da.setAttribute('r', '7')
    gA.appendChild(da)
    svg.appendChild(gA)

    var gB = document.createElementNS(ns, 'g')
    gB.setAttribute('class', 'dsu-ret-rot-b')
    var b = arc(200, 200, 104, 200, 490, 'dsu-ring-b', 'round')
    gB.appendChild(b.node)
    var db = document.createElementNS(ns, 'circle')
    db.setAttribute('class', 'dsu-dot-b')
    db.setAttribute('cx', b.x0.toFixed(2)); db.setAttribute('cy', b.y0.toFixed(2)); db.setAttribute('r', '4')
    gB.appendChild(db)
    svg.appendChild(gB)

    var gC = document.createElementNS(ns, 'g')
    var bl = arc(200, 200, 62, 118, 242, 'dsu-bracket', 'round')
    var br = arc(200, 200, 62, 298, 62, 'dsu-bracket', 'round')
    gC.appendChild(bl.node); gC.appendChild(br.node)
    svg.appendChild(gC)

    var pts = [[152, 132], [252, 268], [278, 150]]
    for (var i = 0; i < pts.length; i++) {
      var c = document.createElementNS(ns, 'circle')
      c.setAttribute('class', 'dsu-dot-o')
      c.setAttribute('cx', pts[i][0]); c.setAttribute('cy', pts[i][1]); c.setAttribute('r', '2.8')
      svg.appendChild(c)
    }
    ui.reticle.appendChild(svg)
  })()


  /* RhineLabUI: scanTrack, scanOrbitTrack and interpolation, LBEILC, MIT.
     Reference commit 12cc5e4013acb9408f753ff71de6b8492299b7c8. */
  var referenceScan = window.__CODEX_STAGED__ ? (function () {
    function track(keys, frame) {
      if (frame <= keys[0][0]) return keys[0][1];
      const last = keys.length - 1;
      if (frame >= keys[last][0]) return keys[last][1];
      const slope = (i) =>
        (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
      const tangent = (i) => {
        if (i === 0) return slope(0);
        if (i === last) return slope(last - 1);
        const a = slope(i - 1),
          b = slope(i);
        if (a * b <= 0) return 0;
        const h0 = keys[i][0] - keys[i - 1][0],
          h1 = keys[i + 1][0] - keys[i][0];
        const w0 = 2 * h1 + h0,
          w1 = h1 + 2 * h0;
        return (w0 + w1) / (w0 / a + w1 / b);
      };
      let i = 0;
      while (frame > keys[i + 1][0]) i++;
      const h = keys[i + 1][0] - keys[i][0],
        p = (frame - keys[i][0]) / h;
      return (
        (2 * p ** 3 - 3 * p ** 2 + 1) * keys[i][1] +
        (p ** 3 - 2 * p ** 2 + p) * h * tangent(i) +
        (-2 * p ** 3 + 3 * p ** 2) * keys[i + 1][1] +
        (p ** 3 - p ** 2) * h * tangent(i + 1)
      );
    }


    function scanTrack(frame) {
      const value = (keys) => track(keys, frame);
      const rad = Math.PI / 180;
      return {
        radius: value([
          [487, 2000],
          [492, 1540],
          [497, 1095],
          [500, 895.5],
          [505, 650],
          [510, 492],
          [515, 385.5],
          [520, 320.5],
          [524, 287.5],
          [527, 275],
          [530, 270],
          [535, 265.5],
          [540, 262],
          [545, 258],
          [550, 255],
          [555, 252.5],
          [560, 250],
          [568, 246],
        ]),
        whiteRadius: value([
          [487, 1500],
          [492, 1011],
          [493, 955],
          [494, 893],
          [495, 834],
          [496, 783],
          [497, 737],
          [498, 693.5],
          [499, 655],
          [500, 619],
          [505, 470.5],
          [510, 374],
          [515, 310.5],
          [520, 272],
          [524, 253.5],
          [527, 248],
          [530, 246],
          [535, 242],
          [540, 238],
          [545, 235],
          [550, 232.5],
          [555, 230],
          [560, 227.5],
          [568, 224],
        ]),
        outerStart:
          rad *
          value([
            [487, 470],
            [492, 364],
            [497, 276],
            [500, 226],
            [505, 159.75],
            [510, 98.75],
            [515, 49.25],
            [520, 13.25],
            [524, -9],
            [527, -23],
            [530, -36.25],
            [535, -53],
            [540, -66.25],
            [545, -75.75],
            [550, -82.75],
            [560, -89],
            [568, -90],
          ]),
        outerSweep:
          rad *
          value([
            [487, 30],
            [492, 105],
            [497, 170],
            [500, 199],
            [505, 241.5],
            [510, 270.25],
            [515, 295.75],
            [520, 313.25],
            [527, 331],
            [530, 336.75],
            [535, 344.5],
            [540, 350.75],
            [545, 355],
            [550, 358],
            [560, 360],
            [568, 360],
          ]),
        whiteStart:
          rad *
          value([
            [487, -100],
            [492, -30],
            [497, 72],
            [500, 107],
            [505, 140],
            [510, 172],
            [515, 196],
            [520, 213.75],
            [527, 234.5],
            [530, 241],
            [535, 249.75],
            [540, 256.75],
            [545, 262.25],
            [550, 265.75],
            [560, 269.5],
            [568, 270],
          ]),
        whiteSweep:
          rad *
          value([
            [487, 30],
            [492, 105],
            [497, 170],
            [500, 200],
            [505, 241.25],
            [510, 272.75],
            [515, 295.5],
            [520, 313.75],
            [527, 330.5],
            [530, 335.5],
            [535, 343.5],
            [540, 349.5],
            [545, 354],
            [550, 357],
            [560, 360],
            [568, 360],
          ]),
        innerRadius: value([
          [487, 124.5],
          [492, 123],
          [495, 121],
          [500, 117.5],
          [505, 112],
          [510, 107.5],
          [515, 104],
          [520, 101.5],
          [530, 97],
          [540, 94],
          [550, 91.5],
          [560, 90],
          [568, 88.5],
        ]),
        innerStart:
          rad *
          value([
            [487, -20],
            [490, -4.25],
            [492, 14],
            [495, 48.75],
            [497, 69.25],
            [500, 93.25],
            [505, 121.25],
            [510, 141],
            [515, 155.5],
            [520, 166.5],
            [527, 178],
            [530, 181],
            [535, 187.75],
            [540, 192],
            [545, 195.25],
            [550, 197.75],
            [555, 199.75],
            [560, 200.75],
            [568, 201.5],
          ]),
        innerSweep:
          rad *
          value([
            [487, 0],
            [492, 22.5],
            [497, 55.75],
            [500, 70.25],
            [505, 87.25],
            [510, 99],
            [515, 108],
            [520, 115],
            [527, 123.5],
            [530, 127],
            [535, 128],
            [540, 131],
            [550, 134],
            [568, 136],
          ]),
        orbit:
          rad *
          value([
            [487, 70],
            [492, 33],
            [493, 13.2],
            [494, -5.8],
            [495, -24.2],
            [496, -41.4],
            [497, -57.2],
            [498, -71.4],
            [499, -84.2],
            [500, -96],
            [505, -140.8],
            [510, -172.3],
            [515, -195.5],
            [520, -213.5],
            [527, -234],
            [530, -238.8],
            [535, -247.7],
            [540, -254.7],
            [545, -260.1],
            [550, -264],
            [555, -266.9],
            [560, -268.8],
            [568, -270],
          ]),
        orbitRadius: value([
          [487, 270],
          [495, 236],
          [500, 224],
          [505, 214],
          [510, 206],
          [515, 199],
          [520, 193],
          [530, 185],
          [540, 179.5],
          [550, 174.5],
          [560, 171.5],
          [568, 169],
        ]),
        dotRadius: value([
          [487, 0],
          [492, 1],
          [500, 5.6],
          [510, 7],
          [520, 7.8],
          [530, 8],
          [568, 8],
        ]),
        blackCap: value([
          [487, 45],
          [504, 35],
          [510, 20],
          [515, 10],
          [520, 5],
          [525, 2.5],
          [535, 2],
          [550, 0],
          [568, 0],
        ]),
        whiteCap: value([
          [487, 40],
          [492, 30],
          [497, 22],
          [502, 16],
          [507, 10],
          [512, 5],
          [520, 1.5],
          [540, 0],
          [568, 0],
        ]),
      };
    }

    // Source frames 543–568. Angles are unwrapped: the left arc turns clockwise,
    // the right arc counterclockwise. Each grows while its angular speed decays.
    // Columns: frame, left x/y, right x/y, radius, left/right start, left/right sweep.
    // Early short strokes are manually fitted; longer arcs are measured by
    // reference/measure-scan-detail.py. Centers also settle towards y=539.5.
    const sides = [
      [543, 827.5, 561, 1091, 518, 38.7, 260, 250, 0, 0],
      [544, 827.5, 561, 1091, 518, 38.7, 260, 250, 3, 3],
      [545, 827.5, 560.5, 1091, 518.5, 38.6, 265, 236, 17, 17],
      [546, 827.5, 559.5, 1091, 519.5, 38.5, 274, 190, 44, 44],
      [547, 827.6, 558.2, 1090.6, 520.8, 38.5, 296, 121, 79, 81],
      [548, 828.06, 556.76, 1090.35, 522.58, 38.38, 332.38, 50.99, 111.73, 113.42],
      [549, 827.84, 555.13, 1090.42, 524.39, 38.34, 367.27, -14.03, 141.56, 145.66],
      [550, 827.89, 553.28, 1090.2, 525.89, 38.44, 396.14, -68.97, 168.88, 172.89],
      [551, 828, 551.68, 1090.21, 527.44, 38.28, 421.62, -113.84, 191.68, 195.3],
      [552, 828.19, 550.24, 1089.94, 528.85, 38.25, 444.24, -152.25, 208.55, 215.7],
      [553, 828.42, 548.83, 1089.7, 530.24, 38.18, 462.76, -184.19, 225.92, 230.73],
      [554, 828.61, 547.64, 1089.53, 531.44, 38.12, 479.15, -212.29, 239.9, 244.63],
      [555, 828.8, 546.47, 1089.37, 532.55, 38.03, 494.23, -237.06, 251.56, 257.75],
      [
        556, 829.06, 545.41, 1089.16, 533.53, 37.91, 508.57, -259.19, 261.49,
        267.63,
      ],
      [557, 829.25, 544.49, 1088.93, 534.52, 37.87, 520.46, -279.2, 271.23, 278.42],
      [558, 829.47, 543.66, 1088.7, 535.37, 37.79, 530.39, -295.86, 280.34, 286.17],
      [559, 829.75, 542.88, 1088.46, 536.12, 37.72, 541.33, -312.5, 287.17, 295.12],
      [
        560, 829.95, 542.16, 1088.26, 536.88, 37.65, 549.47, -326.37, 295.98,
        301.16,
      ],
      [
        561, 830.16, 541.63, 1088.02, 537.41, 37.57, 557.82, -338.78, 302.29,
        307.52,
      ],
      [562, 830.33, 541.08, 1087.81, 537.94, 37.52, 565.1, -350.74, 307.99, 312.58],
      [
        563, 830.59, 540.65, 1087.61, 538.36, 37.43, 571.89, -362.08, 313.78,
        319.28,
      ],
      [
        564, 830.83, 540.28, 1087.38, 538.74, 37.37, 578.93, -371.93, 316.97,
        323.53,
      ],
      [
        565, 831.04, 539.97, 1087.14, 539.04, 37.35, 583.85, -380.51, 322.27,
        327.78,
      ],
      [
        566, 831.25, 539.74, 1086.93, 539.28, 37.27, 589.84, -388.93, 325.61,
        331.62,
      ],
      [567, 831.48, 539.56, 1086.73, 539.4, 37.19, 594, -396.5, 330.93, 335.92],
      [568, 831.61, 539.51, 1086.55, 539.48, 37.15, 599.44, -403.94, 332.25, 338.7],
    ];
    const columns = Array.from({ length: 9 }, (_, i) =>
      sides.map((row) => [row[0], row[i + 1]]),
    );
    const orbit = [
      [548, 926.33, 554.33],
      [551, 944.38, 572.15],
      [553, 954.92, 575.05],
      [555, 963, 575],
      [558, 971.63, 572.85],
      [561, 977.53, 569.78],
      [564, 981.5, 566.86],
      [568, 984.71, 563.5],
    ];
    const orbitAngle = orbit.map(
      ([f, x, y]) => [f, Math.atan2(y - 539.5, x - 959.5)],
    );
    const orbitRadius = orbit.map(
      ([f, x, y]) => [f, Math.hypot(x - 959.5, y - 539.5)],
    );
    const dotGrowth = [
      [-1, 0],
      [0, 0.8],
      [1, 1.7],
      [2, 2.35],
      [3, 2.85],
      [4, 3.15],
      [5, 3.45],
      [7, 3.8],
      [10, 4.1],
      [15, 4.25],
      [20, 4.25],
    ];

    function scanOrbitTrack(frame) {
      const values = columns.map((keys) => track(keys, frame));
      const [lx, ly, rx, ry, radius, leftStart, rightStart, leftSweep, rightSweep] =
        values;
      const angle = track(orbitAngle, frame),
        distance = track(orbitRadius, frame);
      const sourceFrame = Math.floor(frame + 0.00001);
      // Large core flashes are editorial cuts. The small core then grows gently
      // as six satellites appear in three-frame steps, with continuing orbit phase.
      const flash = [546, 547, 549, 550].includes(sourceFrame);
      const coreRadius = flash
        ? track(
            [
              [546, 42.93],
              [550, 42.43],
            ],
            frame,
          )
        : track(
            [
              [545, 0],
              [548, 7.96],
              [551, 9.89],
              [553, 10.63],
              [555, 11.08],
              [559, 11.45],
              [564, 11.45],
              [568, 11.27],
            ],
            frame,
          );
      return {
        sides: [
          {
            x: lx,
            y: ly,
            radius,
            start: (leftStart * Math.PI) / 180,
            sweep: (leftSweep * Math.PI) / 180,
          },
          {
            x: rx,
            y: ry,
            radius,
            start: (rightStart * Math.PI) / 180,
            sweep: (rightSweep * Math.PI) / 180,
          },
        ],
        sideVisible: frame >= 544,
        coreRadius,
        satellites: Array.from({ length: 6 }, (_, i) => {
          const phase = angle + (i * Math.PI) / 3;
          return {
            x: 959.5 + Math.cos(phase) * distance,
            y: 539.5 + Math.sin(phase) * distance,
            radius: track(dotGrowth, frame - 548 - i * 3),
          };
        }),
      };
    }
    var ns = 'http://www.w3.org/2000/svg'
    var svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('class', 'dsu-reference-scan')
    svg.setAttribute('viewBox', '0 0 1920 1080')
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svg.setAttribute('aria-hidden', 'true')
    var group = document.createElementNS(ns, 'g')
    group.setAttribute('fill', 'none')
    group.setAttribute('stroke', 'var(--dsu-ink)')
    group.setAttribute('stroke-width', '2')
    group.setAttribute('stroke-linecap', 'round')
    svg.appendChild(group)
    var paths = []
    for (var i = 0; i < 6; i++) {
      var path = document.createElementNS(ns, 'path')
      if (i === 1) path.setAttribute('stroke', 'var(--dsu-box-ink)')
      group.appendChild(path)
      paths.push(path)
    }
    function circle(cls, color) {
      var node = document.createElementNS(ns, 'circle')
      node.setAttribute('class', cls)
      node.setAttribute('fill', color)
      node.setAttribute('stroke', 'none')
      group.appendChild(node)
      return node
    }
    var orbitDots = [circle('dsu-reference-orbit', 'var(--dsu-accent)'), circle('dsu-reference-orbit', 'var(--dsu-accent)')]
    var satellites = []
    for (var j = 0; j < 6; j++) satellites.push(circle('dsu-reference-satellite', 'var(--dsu-ink)'))
    var core = circle('dsu-reference-core', 'var(--dsu-ink)')
    core.setAttribute('cx', '959.5'); core.setAttribute('cy', '539.5')
    var caps = [circle('dsu-reference-cap', 'var(--dsu-ink)'), circle('dsu-reference-cap', 'var(--dsu-box-ink)')]
    ui.reticle.appendChild(svg)
    var request = 0

    function arc(r, start, sweep, x, y) {
      x = x == null ? 960 : x; y = y == null ? 540 : y
      function point(angle) { return (x + Math.cos(angle) * r) + ',' + (y + Math.sin(angle) * r) }
      if (sweep >= Math.PI * 1.999)
        return 'M' + point(start) + 'A' + r + ',' + r + ' 0 1 1 ' + point(start + Math.PI) + 'A' + r + ',' + r + ' 0 1 1 ' + point(start + Math.PI * 2)
      return 'M' + point(start) + 'A' + r + ',' + r + ' 0 ' + (sweep > Math.PI ? 1 : 0) + ' 1 ' + point(start + sweep)
    }
    function draw(frame) {
      var scan = scanTrack(frame), orbit = scanOrbitTrack(frame)
      var sourceFrame = Math.floor(frame + 0.00001)
      var flash = [525, 526, 528, 529].includes(sourceFrame)
      var scale = flash ? 1.94 : 1
      group.setAttribute('transform', 'translate(960 540) scale(' + scale + ') translate(-960 -540)')
      group.style.opacity = String(flash ? 0.32 : track([[487,0],[488,0.18],[490,0.6],[493,1]], frame))
      group.style.filter = flash ? 'blur(2.2px)' : 'none'
      paths[0].setAttribute('d', arc(scan.radius, scan.outerStart, scan.outerSweep))
      paths[0].setAttribute('stroke-width', '2.4')
      paths[1].setAttribute('d', arc(scan.whiteRadius, scan.whiteStart, scan.whiteSweep))
      paths[1].setAttribute('stroke-width', '4')
      paths[2].setAttribute('d', arc(scan.innerRadius, scan.innerStart, scan.innerSweep))
      paths[3].setAttribute('d', arc(scan.innerRadius, scan.innerStart + Math.PI, scan.innerSweep))
      orbit.sides.forEach(function (side, n) {
        paths[n + 4].setAttribute('d', arc(side.radius, side.start, side.sweep, side.x, side.y))
        paths[n + 4].style.opacity = orbit.sideVisible ? '1' : '0'
      })
      orbit.satellites.forEach(function (point, n) {
        satellites[n].setAttribute('cx', String(point.x)); satellites[n].setAttribute('cy', String(point.y))
        satellites[n].setAttribute('r', String(point.radius))
      })
      core.style.opacity = frame >= 546 ? '1' : '0'
      core.setAttribute('r', String(orbit.coreRadius))
      orbitDots.forEach(function (dot, n) {
        var angle = scan.orbit + n * Math.PI
        dot.setAttribute('cx', String(960 + Math.cos(angle) * scan.orbitRadius))
        dot.setAttribute('cy', String(540 + Math.sin(angle) * scan.orbitRadius))
        dot.setAttribute('r', String(scan.dotRadius))
      })
      caps.forEach(function (cap, n) {
        var angle = n ? scan.whiteStart : scan.outerStart + scan.outerSweep
        var radius = n ? scan.whiteRadius : scan.radius
        cap.setAttribute('cx', String(960 + Math.cos(angle) * radius))
        cap.setAttribute('cy', String(540 + Math.sin(angle) * radius))
        cap.setAttribute('r', String(n ? scan.whiteCap : scan.blackCap))
      })
      var textOpacity = frame < 545 ? Math.max(0, Math.min(1, (frame - 487) / 10)) :
        track([[545,1],[546,0.4],[547,0.3],[548,0.25],[549,0.1],[550,0.04],[551,0]], frame)
      ui.center.style.opacity = String(textOpacity)
    }
    function stop() {
      if (request) cancelAnimationFrame(request)
      request = 0
      ui.center.style.removeProperty('opacity')
    }
    function start() {
      stop()
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        draw(520)
        return
      }
      var started = performance.now()
      draw(487)
      function tick(now) {
        if (finished || skipped || stale()) return
        var frame = Math.min(568, 487 + (now - started) * C.speed * 15 / 1000)
        draw(frame)
        if (frame < 568) request = requestAnimationFrame(tick)
        else request = 0
      }
      request = requestAnimationFrame(tick)
    }
    return { start: start, stop: stop }
  })() : null

  /* ── 时间线引擎 ───────────────────────────────────────────────────────── */
  var timers = []
  var waiters = []
  var skipped = false
  var finished = false
  var hexTimer = null
  var sequenceReady = Promise.resolve()

  function ms(base) { return Math.round(base / C.speed) }

  function wait(base) {
    return new Promise(function (resolve) {
      if (skipped) return resolve()
      var done = false
      function fin() {
        if (done) return
        done = true
        var i = waiters.indexOf(fin)
        if (i >= 0) waiters.splice(i, 1)
        resolve()
      }
      var t = setTimeout(fin, Math.max(0, ms(base)))
      timers.push(t)
      waiters.push(fin)
    })
  }

  function waitAction() {
    return new Promise(function (resolve) {
      if (skipped || !C.requireInteraction) return resolve()
      /* 等用户操作期间不上弦：正在犹豫的人不该被看门狗踢出去 */
      disarmStall()
      var done = false
      function fin() {
        if (done) return
        done = true
        cleanup()
        armStall()
        resolve()
      }
      function onKey(e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (!e.repeat) fin() }
      }
      function onClick(e) { e.preventDefault(); fin() }
      function cleanup() {
        ui.btn.removeEventListener('click', onClick)
        ui.action.removeEventListener('click', onClick)
        document.removeEventListener('keydown', onKey)
        var i = waiters.indexOf(fin)
        if (i >= 0) waiters.splice(i, 1)
      }
      ui.btn.addEventListener('click', onClick)
      ui.action.addEventListener('click', onClick)
      document.addEventListener('keydown', onKey)
      waiters.push(fin)
    })
  }

  function releaseAll() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i])
    timers.length = 0
    var list = waiters.slice()
    waiters.length = 0
    for (var j = 0; j < list.length; j++) { try { list[j]() } catch (err) { /* noop */ } }
  }

  function setProgress(p) {
    var pct = Math.max(0, Math.min(1, p))
    ui.bar.style.width = Math.round(pct * 100) + '%'
  }

  /** 六格阶段柱：走过的压暗、当前的拉满并点亮主题橙 */
  function setSlats(active) {
    var items = ui.slats.children
    for (var i = 0; i < items.length; i++) {
      var idx = i + 1
      items[i].classList.toggle('dsu-on', idx === active)
      items[i].classList.toggle('dsu-past', idx < active)
    }
  }

  /** 扫描线自上而下扫一遍（底板洗白后一次，验准时再一次） */
  function sweep() {
    if (!ui.scanline) return
    ui.scanline.classList.remove('dsu-go')
    void ui.scanline.offsetWidth
    ui.scanline.classList.add('dsu-go')
  }

  function paintClock() {
    var d = new Date()
    var pad = function (n) { return (n < 10 ? '0' : '') + n }
    ui.meta2.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  }

  function setSubtitle(zh, en) {
    ui.subZh.classList.remove('dsu-in')
    ui.subEn2.classList.remove('dsu-in')
    setTimeout(function () {
      ui.subZh.textContent = zh || ''
      ui.subEn2.textContent = en || ''
      ui.subZh.classList.add('dsu-in')
      if (en) ui.subEn2.classList.add('dsu-in')
    }, ms(140))
  }

  function setStepCount(i, code) {
    var totalSteps = STEPS.length + 1
    ui.stepcount.textContent = '[ ' + String(i).padStart(2, '0') + ' / ' +
      String(totalSteps).padStart(2, '0') + ' ] ' + code
  }

  function startHex() {
    var lines = 12
    function line() {
      var s = ''
      for (var i = 0; i < 26; i++) {
        s += '0123456789ABCDEF'.charAt(Math.floor(Math.random() * 16))
        if (i % 2 === 1) s += ' '
      }
      return s
    }
    function paint() {
      var out = []
      for (var i = 0; i < lines; i++) out.push(line())
      ui.hex.innerHTML = out.join('<br>')
    }
    paint()
    ui.hex.classList.add('dsu-in')
    audio.tickRun()
    hexTimer = setInterval(paint, 110)
  }
  function stopHex() {
    if (hexTimer) { clearInterval(hexTimer); hexTimer = null }
    ui.hex.classList.remove('dsu-in')
  }

  /* ── 声音 ──────────────────────────────────────────────────────────────
   * 两条独立的通道，都不依赖任何音频文件：
   *   audio —— 界面音效，WebAudio 现场合成（咔哒 / 双音确认 / 噪声扫频 / 和声钟）
   *   voice —— 女声播报，Web Speech API 念每一行的英文（照参考片的女声节奏：
   *            7.3-9.3s 念状态行、19.6-21.2s 念 PERMISSION AUTHORIZED）
   * 浏览器策略要求"先有用户手势"，所以第一次点击/按键会补一次解锁 + 补播。 */
  function clamp01(v, lo, hi) {
    var n = Number(v)
    return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo
  }

  var audio = (function () {
    var ctx = null
    function ac(force) {
      /* 语音素材要独立于「界面音效」开关：force=true 时无视 C.sound */
      if (!C.sound && !force) return null
      try {
        var AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return null
        if (!ctx) ctx = new AC()
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume()
        return ctx
      } catch (e) { return null }
    }
    function vol(gain) { return Math.max(0.0002, (gain == null ? 0.05 : gain) * clamp01(C.soundVolume, 0, 1) * 2) }
    function tone(freq, dur, type, gain, delay, glideTo) {
      var c = ac(); if (!c) return
      try {
        var t0 = c.currentTime + (delay || 0)
        var o = c.createOscillator(), g = c.createGain()
        o.type = type || 'sine'
        o.frequency.setValueAtTime(freq, t0)
        if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur)
        g.gain.setValueAtTime(0.0001, t0)
        g.gain.exponentialRampToValueAtTime(vol(gain), t0 + Math.min(0.02, dur * 0.3))
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
        o.connect(g); g.connect(c.destination)
        o.start(t0); o.stop(t0 + dur + 0.03)
      } catch (e) { /* 静默降级 */ }
    }
    function noise(dur, gain) {
      var c = ac(); if (!c) return
      try {
        var n = Math.floor(c.sampleRate * dur)
        var buf = c.createBuffer(1, n, c.sampleRate)
        var d = buf.getChannelData(0)
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
        var src = c.createBufferSource(); src.buffer = buf
        var f = c.createBiquadFilter(); f.type = 'bandpass'
        f.frequency.value = 1500; f.Q.value = 0.6
        var g = c.createGain(); g.gain.value = vol(gain)
        src.connect(f); f.connect(g); g.connect(c.destination)
        src.start()
      } catch (e) { /* 静默降级 */ }
    }
    /* 从 /dsh-startup/asset/ 拉真素材（用户音频里抠出来的"哒"）并解码缓存；
       拿不到就自动回落到下面合成的音，功能不依赖网络/素材存在与否。 */
    var buffers = {}
    var fetching = {}
    function loadAsset(name) {
      if (C.sfx === 'synth') return
      if (buffers[name] || fetching[name]) return
      fetching[name] = true
      try {
        fetch('/dsh-startup/asset/' + name + '.mp3')
          .then(function (r) { return r.ok ? r.arrayBuffer() : null })
          .then(function (ab) { return ab ? ac().decodeAudioData(ab) : null })
          .then(function (buf) { if (buf) buffers[name] = buf })
          .catch(function () { /* 没素材就走合成音 */ })
      } catch (e) { /* fetch 不存在也一样降级 */ }
    }
    /* 素材预加载：fetch + decodeAudioData 不需要用户手势，所以加载时就拉，
       这样第一步就能用真声，而不用等用户第一次点击。 */
    var pending = {}
    function ensureAsset(name) {
      if (buffers[name]) return Promise.resolve(true)
      if (pending[name]) return pending[name]
      if (C.voiceSource === 'tts') return Promise.resolve(false)
      pending[name] = new Promise(function (resolve) {
        try {
          fetch('/dsh-startup/asset/' + name + '.mp3')
            .then(function (r) { return r.ok ? r.arrayBuffer() : null })
            .then(function (ab) { if (!ab) return null; return ac(true).decodeAudioData(ab) })
            .then(function (buf) {
              if (buf) { buffers[name] = buf; resolve(true) } else { resolve(false) }
            })
            .catch(function () { resolve(false) })
        } catch (e) { resolve(false) }
      })
      return pending[name]
    }

    /** 播素材并等它播完，resolve 实际时长(ms)。拿不到素材 resolve 0。
     *  onended 是唯一正常出口，但音频上下文挂起时它永远不会来 —— 加一道超时兜底，
     *  保证这一步的 Promise 一定会有结果，不会把用户永久锁在黑幕里。 */
    function playAssetAndWait(name, gain) {
      return new Promise(function (resolve) {
        var c = ac(true)
        var buf = buffers[name]
        if (!c || !buf) { resolve(0); return }
        var done = false
        function fin(ms) {
          if (done) return
          done = true
          resolve(ms)
        }
        try {
          var src = c.createBufferSource()
          src.buffer = buf
          var g = c.createGain()
          g.gain.value = Math.min(1, (gain == null ? 0.85 : gain) * clamp01(C.voiceVolume, 0, 1) * 1.6)
          src.connect(g); g.connect(c.destination)
          src.onended = function () { fin(Math.round(buf.duration * 1000)) }
          src.start()
          setTimeout(function () { fin(Math.round(buf.duration * 1000)) }, buf.duration * 1000 + 1500)
        } catch (e) { fin(0) }
      })
    }

    function playAsset(name, gain) {
      var c = ac(); if (!c) return false
      var buf = buffers[name]
      if (!buf) { loadAsset(name); return false }
      try {
        var src = c.createBufferSource()
        src.buffer = buf
        var g = c.createGain()
        g.gain.value = Math.min(1, (gain == null ? 0.55 : gain) * clamp01(C.soundVolume, 0, 1) * 2)
        src.connect(g); g.connect(c.destination)
        src.start()
        return true
      } catch (e) { return false }
    }

    return {
      resume: function () { ac(); loadAsset('sfx-tick'); loadAsset('sfx-ticks-run') },
      preload: function () { loadAsset('sfx-tick'); loadAsset('sfx-ticks-run') },
      ensureAsset: ensureAsset,
      playAssetAndWait: playAssetAndWait,
      /* 文字渐显 / 阶段推进 / 按钮确认 —— 优先用真素材 */
      tick: function () { if (!playAsset('sfx-tick', 0.45)) tone(1760, 0.035, 'square', 0.022) },
      confirm: function () { if (!playAsset('sfx-tick', 0.85)) { tone(660, 0.09, 'triangle', 0.07); tone(990, 0.17, 'triangle', 0.055, 0.085) } },
      tickRun: function () { playAsset('sfx-ticks-run', 0.5) },
      step: function () { if (!playAsset('sfx-tick', 0.6)) { tone(880, 0.05, 'sine', 0.05); tone(1320, 0.07, 'sine', 0.028, 0.045) } },
      hover: function () { tone(2200, 0.02, 'sine', 0.018) },
      sweep: function () { noise(0.75, 0.035) },
      /* 念台词之前的两声轻提示：这一笔让 TTS 从"浏览器念字"变成"系统播报" */
      cue: function () { tone(1046.5, 0.05, 'sine', 0.028); tone(1568, 0.06, 'sine', 0.02, 0.075) },
      rise: function () { tone(220, 1.1, 'sine', 0.032, 0, 990) },
      chime: function () {
        tone(659.25, 0.9, 'sine', 0.055)
        tone(830.61, 0.9, 'sine', 0.04, 0.09)
        tone(987.77, 1.3, 'sine', 0.045, 0.18)
      }
    }
  })()

  var voice = (function () {
    var supported = typeof window !== 'undefined' && !!window.speechSynthesis &&
      typeof window.SpeechSynthesisUtterance === 'function'
    var voices = []
    var picked = { en: null, zh: null }
    var meter = null
    var saidOnce = false
    var pending = { en: '', zh: '' }

    /* 想让它听起来像"AI 播报"，音色本身比什么都重要。
       同一台机器上，"Microsoft Zira Desktop" 是上世纪拼接合成，念长句塑料味很重；
       Edge 的 "... Online (Natural)"、Chrome 的 "Google ..."、macOS 的 Siri 才是神经网络音色。
       所以这里按分数挑，而不是挨个名字第一个命中。 */
    var NATURAL_HINTS = ['natural', 'neural', 'online', 'premium', 'enhanced', 'siri', 'google']
    var FEMALE_HINTS = [
      'aria', 'jenny', 'michelle', 'emma', 'ava', 'libby', 'sonia', 'maisie',
      'zira', 'samantha', 'karen', 'moira', 'tessa', 'victoria', 'serena', 'allison',
      'susan', 'fiona', 'hazel', 'female', 'woman',
      'xiaoxiao', 'xiaoyi', 'xiaomo', 'huihui', 'yaoyao', '晓晓', '晓伊', '女声'
    ]
    var MALE_HINTS = ['david', 'mark', 'guy', 'ryan', 'george', 'daniel', 'alex', 'fred',
      'male', 'yunxi', 'yunjian', 'kangkang']

    /** 给一个音色打分：神经网络 > 女声 > 语种吻合 > 本地 */
    function score(v, want) {
      var name = String(v.name || '').toLowerCase()
      var lang = String(v.lang || '').toLowerCase()
      var sc = 0
      for (var i = 0; i < NATURAL_HINTS.length; i++) {
        if (name.indexOf(NATURAL_HINTS[i]) !== -1) { sc += 60; break }
      }
      for (var j = 0; j < FEMALE_HINTS.length; j++) {
        if (name.indexOf(FEMALE_HINTS[j]) !== -1) { sc += 40; break }
      }
      for (var k = 0; k < MALE_HINTS.length; k++) {
        if (name.indexOf(MALE_HINTS[k]) !== -1) { sc -= 45; break }
      }
      if (lang.indexOf(want) === 0) sc += 25
      if (v.localService) sc += 4          /* 本地音色起播快，不会先卡半秒 */
      if (v.default) sc += 3
      return sc
    }

    /** 挑某语种最合适的一个音色（want 传 'en' / 'zh' 这样的两字母前缀） */
    function bestFor(want) {
      if (!voices.length) return null
      if (C.voiceName) {
        for (var i = 0; i < voices.length; i++) {
          var v = voices[i]
          if (v.name === C.voiceName && String(v.lang || '').toLowerCase().indexOf(want) === 0) return v
        }
      }
      var pool = []
      for (var j = 0; j < voices.length; j++) {
        if (String(voices[j].lang || '').toLowerCase().indexOf(want) === 0) pool.push(voices[j])
      }
      if (!pool.length) pool = voices.slice()
      var best = null
      var bs = -1e9
      for (var n = 0; n < pool.length; n++) {
        var sc = score(pool[n], want)
        if (sc > bs) { bs = sc; best = pool[n] }
      }
      return best
    }

    function setMeter(on) { if (meter) meter.classList.toggle('dsu-on', !!on) }

    function load() {
      if (!supported) return
      try { voices = window.speechSynthesis.getVoices() || [] } catch (e) { voices = [] }
      picked.en = bestFor('en')
      picked.zh = bestFor('zh')
    }

    /** 全大写名字有些引擎会一个字母一个字母念，转成 Title Case 更像在叫名字 */
    function spokenName(name) {
      return String(name || '').replace(/\S+/g, function (w) {
        return (/^[A-Z0-9.\-]+$/.test(w) && w.length > 1) ? w.charAt(0) + w.slice(1).toLowerCase() : w
      })
    }

    function utter(text, lang) {
      try {
        var u = new window.SpeechSynthesisUtterance(text)
        var v = lang.indexOf('zh') === 0 ? picked.zh : picked.en
        if (v) { u.voice = v; u.lang = v.lang || lang } else u.lang = lang
        /* 神经网络音色在 .95 / 1.02 这个档位最像"系统在播报"：
           再快就赶，再慢就假；音调略抬一点显得干净利落 */
        u.rate = clamp01(C.voiceRate, 0.5, 2)
        u.pitch = clamp01(C.voicePitch, 0, 2)
        u.volume = clamp01(C.voiceVolume, 0, 1)
        u.onstart = function () { setMeter(true) }
        u.onend = function () { setMeter(false) }
        u.onerror = function () { setMeter(false) }
        window.speechSynthesis.speak(u)
        return true
      } catch (e) { return false }
    }

    /** 一句话的时长估算（个别引擎不触发 onend 时兜底；中文按字、英文按字符） */
    function estimateMs(items) {
      var chars = 0
      var rate = clamp01(C.voiceRate, 0.5, 2) || 1
      for (var i = 0; i < items.length; i++) {
        var t = String(items[i].t || '')
        chars += /[\u4e00-\u9fa5]/.test(t) ? t.length * 1.7 : t.length
      }
      return Math.round((chars / 13) * 1000 / rate) + 460
    }

    function buildUtter(text, lang) {
      var u = new window.SpeechSynthesisUtterance(text)
      var v = lang.indexOf('zh') === 0 ? picked.zh : picked.en
      if (v) { u.voice = v; u.lang = v.lang || lang } else u.lang = lang
      u.rate = clamp01(C.voiceRate, 0.5, 2)
      u.pitch = clamp01(C.voicePitch, 0, 2)
      u.volume = clamp01(C.voiceVolume, 0, 1)
      return u
    }

    return {
      supported: supported,
      load: load,
      attach: function (node) { meter = node },

      /**
       * 念一行，返回"这一行实际花了多久(ms)"的 Promise。
       *
       * 三个关键决定：
       *  - **不 cancel 上一句**。原来每步都 cancel，用户点快一点、或者
       *    hold 短于台词长度，语音就被硬生生掐断 —— 那正是要避免的。
       *    speechSynthesis 本身是队列，不 cancel 就是顺序播报。
       *  - 提示音响过之后留 `voiceLead` 的空白再开口，这是旁白的呼吸感。
       *  - 等 `onend` 才 resolve，动画据此决定这一步停多久；个别引擎不触发
       *    onend 时按估算兜底，绝不把动画卡死。
       */
      line: function (en, zh, asset) {
        /* 有真声素材就优先用素材（音色就是你给的那个）；拿不到再回落 TTS */
        if (asset && C.voice && C.voiceSource !== 'tts' && !finished) {
          return audio.ensureAsset(asset).then(function (ok) {
            if (!ok || finished) return 0
            if (C.voiceCue !== false) audio.cue()
            return audio.playAssetAndWait(asset, 0.85).then(function (ms) {
              if (ms > 0) setMeter(true)
              return ms
            })
          }).then(function (ms) {
            if (ms > 0) { saidOnce = true; return ms }
            return ttsLine(en, zh)
          })
        }
        return ttsLine(en, zh)
      },

      /** TTS 路径：素材缺失 / voiceSource=tts / 终幕那条动态名字 */
      tts: function (en, zh) { return ttsLine(en, zh) },

      /** 不等待的版本：设置页试听 / 任何"念完就行"的场合 */
      say: function (en, zh) { return this.line(en, zh) },

      /** 浏览器要求"先有用户手势"才放声：第一次点击/按键解锁 + 补播当前行 */
      unlock: function () {
        try { if (supported) window.speechSynthesis.resume() } catch (e) {}
        audio.resume()
        /* 预热：先无声念一个空格，把引擎唤醒，避免第一句被吃掉开头半个字 */
        if (supported && !saidOnce) {
          try {
            var w = new window.SpeechSynthesisUtterance(' ')
            w.volume = 0
            var v = picked.en || picked.zh
            if (v) { w.voice = v; w.lang = v.lang }
            window.speechSynthesis.speak(w)
          } catch (e) { /* noop */ }
        }
        if (!saidOnce && C.voice && (pending.en || pending.zh)) this.say(pending.en, pending.zh)
      },
      speakName: spokenName,
      current: function () {
        var a = picked.en ? picked.en.name : ''
        var b = picked.zh ? picked.zh.name : ''
        return a === b ? a : (a + (b ? '  /  ' + b : ''))
      },
      listVoices: function () { return voices.slice() },
      /** 只有这里才真的掐断语音（跳过 / 揭幕） */
      stop: function () { try { if (supported) window.speechSynthesis.cancel() } catch (e) {} setMeter(false) }
    }

    /** TTS 合成并等它念完，resolve 实际时长(ms)；拿不到引擎时 resolve 0。 */
    function ttsLine(en, zh) {
      return new Promise(function (resolve) {
        if (!supported || !C.voice || finished) { resolve(0); return }
        pending = { en: en || '', zh: zh || '' }
        var items = []
        var mode = C.voiceLang
        if (mode === 'zh') { if (zh) items.push({ t: zh, l: 'zh-CN' }) }
        else if (mode === 'both') {
          if (zh) items.push({ t: zh, l: 'zh-CN' })
          if (en) items.push({ t: en, l: 'en-US' })
        } else if (en) { items.push({ t: en, l: 'en-US' }) }
        if (!items.length) { resolve(0); return }

        saidOnce = true
        if (C.voiceCue !== false) audio.cue()

        var startedAt = Date.now()
        var est = estimateMs(items)
        var lead = clamp01(C.voiceLead, 0, 1200)
        var settled = false
        var watchdog = null

        function settle() {
          if (settled) return
          settled = true
          if (watchdog) clearTimeout(watchdog)
          setMeter(false)
          resolve(Math.max(0, Date.now() - startedAt))
        }

        setTimeout(function () {
          if (finished) { settle(); return }
          var last = items.length - 1
          for (var i = 0; i <= last; i++) {
            var u = buildUtter(items[i].t, items[i].l)
            if (i === last) {
              u.onstart = function () { setMeter(true) }
              u.onend = settle
              u.onerror = settle
            }
            try { window.speechSynthesis.speak(u) } catch (e) { if (i === last) settle() }
          }
          watchdog = setTimeout(settle, est + 900)
        }, lead)
      })
    }
  })()

  /* 语音/音效接线：声卡要等用户手势才能出声，这里挂一次性解锁 */
  voice.attach(q('.dsu-voice'))
  ;(function preloadVoices() {
    if (C.voiceSource === 'tts') return
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].audio) audio.ensureAsset(STEPS[i].audio)
    audio.ensureAsset('line-6')   /* 终幕欢迎语 */
  })()
  ;(function wireSound() {
    voice.load()
    if (voice.supported && typeof window.speechSynthesis.addEventListener === 'function') {
      try { window.speechSynthesis.addEventListener('voiceschanged', function () { voice.load() }) } catch (e) {}
    }
    var unlocked = false
    function unlock() {
      if (unlocked) return
      unlocked = true
      voice.unlock()
      document.removeEventListener('pointerdown', unlock, true)
      document.removeEventListener('keydown', unlock, true)
      document.removeEventListener('touchstart', unlock, true)
    }
    document.addEventListener('pointerdown', unlock, true)
    document.addEventListener('keydown', unlock, true)
    document.addEventListener('touchstart', unlock, true)
  })()

  /* ── 时间线 ───────────────────────────────────────────────────────────── */
  function run() {
    /* 标记「时间线真的跑起来了」：9 秒兜底只放行"压根没跑"的情况，不误杀正常播放 */
    window.__DSH_STARTUP_RUNNING__ = true
    armStall()
    /* 第一幕就是纯黑：先把桌面端标题栏整层透明化，按钮与色块一并消失 */
    chromeSync.hide()
    return Promise.resolve()
      /* 第一幕：黑幕 --> DeepSeek 标识 */
      .then(function () {
        if (finished || skipped || stale()) return
        return wait(820)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        ui.blackInner.classList.add('dsu-in')
        audio.rise()
        return wait(240)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        ui.blackEn.classList.add('dsu-tighten')
        return wait(880)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        ui.sweep.classList.add('dsu-go')
        return wait(760)
      })
      /* 过场：过曝洗白 */
      .then(function () {
        if (finished || skipped || stale()) return
        ui.blackInner.classList.add('dsu-out')
        audio.sweep()
        ui.wash.style.transition = 'opacity ' + ms(220) + 'ms linear'
        ui.wash.style.opacity = '1'
        return wait(260)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        ui.plate.style.transition = 'opacity ' + ms(900) + 'ms ease'
        ui.plate.style.opacity = '1'
        ui.watermark.style.transition = 'opacity ' + ms(1100) + 'ms ease'
        ui.watermark.style.opacity = '1'
        ui.wash.style.transition = 'opacity ' + ms(720) + 'ms cubic-bezier(.2,.9,.2,1)'
        ui.wash.style.opacity = '0'
        ui.black.style.transition = 'opacity ' + ms(720) + 'ms ease'
        ui.black.style.opacity = '0'
        return wait(760)
      })
      /* 第二幕：品牌块 / 页脚 / 进度条 */
      .then(function () {
        if (finished || skipped || stale()) return
        ui.brand.classList.add('dsu-in')
        ui.foot.classList.add('dsu-in')
        ui.stepcount.classList.add('dsu-in')
        ui.idline.classList.add('dsu-in')
        ui.frame.classList.add('dsu-in')
        ui.slats.classList.add('dsu-in')
        ui.meta.classList.add('dsu-in')
        ui.vignette.classList.add('dsu-in')
        ui.voice.classList.add('dsu-in')
        setProgress(0.12)
        setStepCount(0, 'BOOT')
        setSlats(0)
        setSubtitle('系统自检中…', 'SYSTEM SELF-CHECK')
        if (C.allowSkip) ui.skip.classList.add('dsu-in')
        return wait(700)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        ui.black.style.display = 'none'
        sweep()
      })
      /* 六个阶段 */
      .then(function () {
        if (finished || skipped || stale()) return
        return stepLoop()
      })
      /* 终幕 */
      .then(function () {
        if (finished || skipped || stale()) return
        return finale()
      })
      .catch(function (err) {
        try { console.warn('[dsh-startup-screen] 动画异常，直接揭幕：', err) } catch (e2) {}
        return finish()
      })
  }

  function stepLoop() {
    var chain = Promise.resolve()
    STEPS.forEach(function (step, i) {
      chain = chain.then(function () {
        if (finished || skipped || stale()) return
        armStall()
        var n = i + 1
        /* 身份读数讲的是「身份已确认」，只属于前两幕。第 3 幕起是「接收访问需求」，
           这句信息已经过期，跟着身份核验一起退场，不再一路挂到终幕。 */
        if (i >= 2) ui.idline.classList.remove('dsu-in')
        setStepCount(n, step.badge)
        setSlats(n)
        setProgress(step.progress)
        setSubtitle(step.log, step.logEn)
        audio.step()
        /* 语音在这里起头，但**不阻塞**下面的文字渐显 —— 两者同时发生 */
        var spoke = voice.line(step.say, step.zh, step.audio)

        ui.status.classList.toggle('dsu-zhline', true)
        /* 先摘掉 dsu-in 并强制一次样式计算，新的逐字 span 才会重新走渐显动画 */
        ui.status.classList.remove('dsu-in')
        ui.subEn.classList.remove('dsu-in')
        void ui.status.offsetWidth
        typeIn(ui.statusZh, step.zh, 46)
        typeIn(ui.subEn, step.en, 13)
        ui.caret.classList.toggle('dsu-on', !!step.action && step.action !== 'auto')
        requestAnimationFrame(function () {
          if (finished) return
          ui.status.classList.add('dsu-in')
          ui.subEn.classList.add('dsu-in')
        })
        ui.rule.classList.add('dsu-in')

        if (step.assembleLogo) {
          if (window.__CODEX_STAGED__) {
            root.classList.add('dsu-processing', 'dsu-first-processing')
            ui.sequenceLogo.classList.add('dsu-in')
            sequenceReady = wait(5200)
          } else assembleLogo()
        }
        if (step.reticle) {
          root.classList.remove('dsu-processing', 'dsu-first-processing')
          if (window.__CODEX_STAGED__) {
            root.classList.add('dsu-verified')
            ui.scanline.classList.remove('dsu-go')
            referenceScan.start()
          }
          ui.sequenceLogo.classList.remove('dsu-in')
          ui.logo.classList.remove('dsu-in')
          ui.dots.hidden = true
          ui.reticle.classList.add('dsu-in')
          if (!window.__CODEX_STAGED__) sweep()
        }
        if (step.hex) {
          if (window.__CODEX_STAGED__) audio.tickRun()
          else startHex()
        }

        /* 这一步停多久 = max(视觉基准, 实际播报时长 + 收尾留白) —— 台词长就多停，
           台词短也不会干等。用户点得快时同样等这一句念完，不掐断。 */
        function holdFor(spoken) {
          var target = Math.max(ms(step.hold), (spoken || 0) + ms(240))
          return wait(Math.max(0, target - (spoken || 0)))
        }

        if (step.action === 'grant' || step.action === 'confirm') {
          showAction(step)
          return wait(520).then(function () {
            if (finished || skipped || stale()) return
            if (step.action === 'confirm' && window.__CODEX_WAIT_ACCOUNT__) {
              disarmStall()
              return window.__CODEX_WAIT_ACCOUNT__()
            }
          }).then(function () {
            if (finished || skipped || stale()) return
            ui.card.classList.add('dsu-ready')
            ui.hint.classList.remove('dsu-pending')
            ui.hint.classList.add('dsu-ready')
            ui.hint.firstElementChild.setAttribute('aria-hidden', 'true')
            ui.hint.lastElementChild.setAttribute('aria-hidden', 'false')
            ui.btn.disabled = false
            ui.btn.classList.add('dsu-pulse')
            return waitAction()
          }).then(function () {
            if (finished || skipped || stale()) return
            if (step.action === 'grant' && window.__CODEX_READ_ACCOUNT__) window.__CODEX_READ_ACCOUNT__()
            if (step.action === 'confirm' && window.__CODEX_START_DESKTOP__) window.__CODEX_START_DESKTOP__()
            hideAction()
            audio.confirm()
            ui.caret.classList.remove('dsu-on')
            return spoke
          }).then(function () { return wait(320) })
        }
        if (step.hex) {
          return spoke.then(holdFor).then(function () {
            if (window.__CODEX_START_DESKTOP__ && !finished && !skipped) {
              disarmStall()
              return Promise.all([window.__CODEX_START_DESKTOP__(), sequenceReady])
            }
          }).then(function () { stopHex() })
        }
        if (window.__CODEX_STAGED__ && step.assembleLogo) return Promise.all([spoke.then(holdFor), wait(2300)])
        if (window.__CODEX_STAGED__ && step.reticle) return Promise.all([spoke.then(holdFor), wait(5540)])
        return spoke.then(holdFor)
      })
    })
    return chain
  }

  function assembleLogo() {
    ui.logo.classList.add('dsu-in')
    ui.dots.hidden = false
    var path = ui.logo.querySelector('path')
    if (path && typeof path.getTotalLength === 'function') {
      try {
        var len = path.getTotalLength()
        path.style.fill = 'none'
        path.style.stroke = 'currentColor'
        path.style.strokeWidth = '8.052'
        path.style.strokeDasharray = len
        path.style.strokeDashoffset = len
        /* 参考片的"一笔画成"：先勾线，再落墨成面 */
        path.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: ms(1400), easing: 'cubic-bezier(.55,.06,.24,1)', fill: 'forwards' }
        )
        setTimeout(function () {
          path.style.transition = 'fill ' + ms(420) + 'ms ease, stroke-width ' + ms(420) + 'ms ease'
          path.style.fill = ''
          path.style.strokeWidth = '0'
        }, ms(1450))
      } catch (err) { /* Web Animations 不可用时直接落墨 */ }
    }
    return wait(300)
  }

  var accountInfo = null
  var identityCode = '----'
  var accountRevealed = false

  function setAccount(info) {
    accountInfo = info
    identityCode = '----'
    if (info.status === 'ready') {
      // Display codes are decorative plan markers, not real account identifiers.
      switch ((info.planLabel || '').toLowerCase().replace(/[-_ ]/g, '')) {
        case 'plus': identityCode = 'L-01x'; break
        case 'prolite': case 'pro100': identityCode = 'H-10x'; break
        case 'pro': case 'pro200': identityCode = 'M-20x'; break
        case 'promax': case 'pro500': identityCode = 'U-50x'; break
      }
    }
    ui.w4.textContent = '欢迎 ---- 访问'
    ui.idline.textContent = '· ID CONFIRMED : ' + (accountRevealed ? identityCode : '----')
    if (info.status === 'ready') {
      if (info.emailMasked) ui.w4.textContent = '欢迎 ' + info.emailMasked + ' 访问'
    }
    if (!ui.card.hidden) renderIdentityCard()
  }

  function renderIdentityCard() {
    var rows = [
      ['身份名称', accountInfo && accountInfo.status === 'ready' ? accountInfo.emailMasked || '----' : '----', true],
      ['身份编号', identityCode, false],
      ['权限等级', accountInfo && accountInfo.status === 'ready' ? 'user' : '----', false]
    ]
    if (!ui.card.children.length) {
      rows.forEach(function (r) {
        var row = el('div', 'dsu-card-row')
        row.appendChild(el('span', null, r[0]))
        row.appendChild(el('b', r[2] ? 'dsu-zhname' : null, r[1]))
        ui.card.appendChild(row)
      })
    }
    rows.forEach(function (r, i) {
      var value = ui.card.children[i].children[1]
      if (value.textContent !== r[1]) value.textContent = r[1]
    })
  }

  function showAction(step) {
    ui.btn.disabled = true
    ui.btn.title = ''
    ui.btnZh.textContent = step.btnZh
    ui.btnEn.textContent = step.btnEn
    ui.card.classList.remove('dsu-ready')
    ui.card.hidden = step.action !== 'confirm'
    if (step.action === 'confirm') {
      accountRevealed = true
      ui.idline.textContent = '· ID CONFIRMED : ' + identityCode
      renderIdentityCard()
    }
    ui.hint.classList.remove('dsu-ready')
    var pending = step.action === 'confirm' && !!window.__CODEX_WAIT_ACCOUNT__
    ui.hint.classList.toggle('dsu-pending', pending)
    ui.hint.removeAttribute('aria-hidden')
    ui.hint.innerHTML = '<span class="dsu-hint-wait" aria-hidden="' + !pending + '"></span>' +
      '<span class="dsu-hint-ready" aria-hidden="true">按 <kbd>Enter</kbd> / <kbd>Space</kbd>，或点击按钮继续</span>'
    ui.hint.firstElementChild.textContent = step.log
    void ui.action.offsetWidth
    ui.action.classList.add('dsu-in')
  }

  function hideAction() {
    ui.action.classList.remove('dsu-in')
    ui.card.classList.remove('dsu-ready')
    ui.hint.classList.remove('dsu-ready', 'dsu-pending')
    ui.hint.setAttribute('aria-hidden', 'true')
    ui.btn.classList.remove('dsu-pulse')
  }

  function finale() {
    if (finished || skipped || stale()) return Promise.resolve()
    armStall()
    setStepCount(6, 'WELCOME')
    setSlats(6)
    setProgress(1)
    /* 底部日志和终幕里的「欢迎 xxx 访问」区分开，避免同一句出现两遍 */
    setSubtitle('身份验证完成，会话已建立', 'IDENTITY VERIFIED · SESSION ESTABLISHED')
    audio.chime()
    /* 终幕欢迎语：自制落幕词素材 line-6（3.73 秒），在欢迎文案亮起的同一刻开念。
       素材缺失 / voiceSource=tts / voice 关闭时静音（调用时 en、zh 都传 null，不会念出合成腔）。 */
    var welcome = null

    ui.status.classList.remove('dsu-in')
    ui.subEn.classList.remove('dsu-in')
    ui.rule.classList.remove('dsu-in')
    if (!window.__CODEX_STAGED__) ui.reticle.classList.remove('dsu-in')
    if (referenceScan) referenceScan.stop()
    stopHex()
    /* 中央区（状态行/分隔线/鲸鱼/虚线）整体退场：不清掉会和 WELCOME 版式叠字 */
    ui.center.classList.add('dsu-off')
    ui.dots.hidden = true

    return wait(360)
      .then(function () {
        if (finished || skipped || stale()) return
        if (window.__CODEX_STAGED__) ui.reticle.classList.remove('dsu-in')
        ui.welcome.classList.add('dsu-in')
        ui.idline.classList.remove('dsu-in')
        /* 欢迎文案亮起的同一刻开口 —— 早于画面会让人以为「话没说完画面就跳了」 */
        welcome = voice.line(null, null, 'line-6')
        return wait(2500)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        /* 结尾色散故障：分片位移 + 0.5px 模糊 + 混合模式，读起来像镜头色散 */
        var targets = [ui.w1, ui.w2, ui.w4]
        targets.forEach(function (t) {
          t.classList.add('dsu-glitch')
          t.setAttribute('data-text', t === ui.w2 ? ui.w2Base.textContent : t.textContent)
        })
        ui.w2.classList.add('dsu-glitch-box')   /* 黑底白字那块换加色混合 */
        void ui.welcome.offsetWidth
        targets.forEach(function (t) { t.classList.add('dsu-on') })
        return wait(360)
      })
      /* 光晕从中心炸开 + 变形光条横扫 + 文字青色 halation */
      .then(function () {
        if (finished || skipped || stale()) return
        root.classList.add('dsu-peak')
        ui.bloom.classList.add('dsu-go')
        ui.streak.classList.add('dsu-go')
        return wait(430)
      })
      /* 光晕最亮那一下补一记极短高光（是"眨一下"，不是长时间糊白） */
      .then(function () {
        if (finished || skipped || stale()) return
        ui.flash.style.transition = 'opacity ' + ms(70) + 'ms linear'
        ui.flash.style.opacity = '0.72'
        return wait(90)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        ui.flash.style.transition = 'opacity ' + ms(340) + 'ms cubic-bezier(0.4, 0, 0.2, 1)'
        ui.flash.style.opacity = '0'
        return wait(320)
      })
      /* 欢迎语没播完就不揭幕（素材缺失时这个 Promise 立刻 resolve，不影响节奏） */
      .then(function () {
        if (finished || skipped || stale()) return
        return welcome
      })
      /* 揭幕：整个机位后撤 + 轻微失焦，比单纯淡出更有镜头感 */
      .then(function () {
        if (finished || skipped || stale()) return
        if (window.__CODEX_NATIVE_HANDOFF__) return finish()
        root.classList.add('dsu-handoff')
        return wait(780)
      })
      .then(function () {
        if (finished || skipped || stale()) return
        return finish()
      })
  }

  function finish() {
    if (finished) return
    finished = true
    window.__DSH_STARTUP_FINISHED__ = true
    disarmStall()
    /* 揭幕即还原桌面端标题栏（root 被移除时 MutationObserver 还会再兜一次） */
    chromeSync.show()
    releaseAll()
    stopHex()
    if (referenceScan) referenceScan.stop()
    voice.stop()
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null }
    if (window.__CODEX_NATIVE_HANDOFF__ && window.__CODEX_NATIVE_HANDOFF__()) return
    try {
      if (C.mode === 'session') window.sessionStorage.setItem('dsh-startup-screen:shown', '1')
      if (C.mode === 'daily') {
        window.localStorage.setItem('dsh-startup-screen:day', new Date().toISOString().slice(0, 10))
      }
    } catch (err) { /* 隐私模式下不可写，忽略 */ }
    /* 解锁：Host 注入的关键样式用 html.dsu-lock 锁滚动，这里必须一并摘掉，
       否则揭幕后主界面会永远滚不动。 */
    document.documentElement.classList.remove('dsu-lock')
    document.documentElement.style.overflow = ''
    if (document.body) document.body.style.overflow = ''
    root.classList.remove('dsu-boot')
    root.classList.add('dsu-gone')
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root)
      try { window.dispatchEvent(new CustomEvent('dsh-startup:done')) } catch (err) { /* noop */ }
    }, ms(900))
  }

  function requestSkip() {
    if (skipped || finished) return
    skipped = true
    releaseAll()
    if (window.__CODEX_START_DESKTOP__) {
      disarmStall()
      hideAction()
      voice.stop()
      stopHex()
      if (referenceScan) referenceScan.stop()
      ui.black.style.display = 'none'
      ui.wash.style.opacity = '0'
      ui.plate.style.opacity = '1'
      ui.watermark.style.opacity = '1'
      ui.welcome.classList.remove('dsu-in')
      ui.center.classList.remove('dsu-off')
      root.classList.remove('dsu-processing', 'dsu-first-processing', 'dsu-verified')
      ui.sequenceLogo.classList.remove('dsu-in')
      ui.logo.classList.remove('dsu-in')
      ui.dots.hidden = true
      ui.reticle.classList.add('dsu-in')
      ui.statusZh.textContent = STEPS[3].zh
      ui.status.classList.add('dsu-in')
      ui.subEn.textContent = STEPS[3].en
      setSubtitle(STEPS[3].log, STEPS[3].logEn)
      window.__CODEX_START_DESKTOP__().then(function () { finish() })
      return
    }
    finish()
  }

  if (C.allowSkip && ui.skip) {
    ui.skip.hidden = false
    ui.skip.addEventListener('click', function (e) { e.stopPropagation(); requestSkip() })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') requestSkip()
    })
  } else if (ui.skip) {
    ui.skip.hidden = true
  }

  /* 对外 API：settings 面板里的"立即预览"按钮和重播都走它 */
  window.__DSH_STARTUP_API__ = {
    /* 设置页试听与冒烟测试用：直接念一行 */
    speak: function (en, zh) { voice.say(en, zh) },
    speakName: function (n) { return voice.speakName(n) },
    get voice() { return voice.current() },
    replay: injectSelf,
    skip: requestSkip,
    finish: finish,
    dispose: dispose,
    setAccount: setAccount,
    get accountStatus() { return accountInfo ? accountInfo.status : 'loading' },
    config: C
  }

  /* 锁滚动，动画期间不露出下面的应用 */
  document.documentElement.classList.add('dsu-lock')
  document.documentElement.style.overflow = 'hidden'
  if (document.body) document.body.style.overflow = 'hidden'
  setProgress(0.05)
  root.classList.remove('dsu-boot')

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run() })
  } else {
    run()
  }
})()
