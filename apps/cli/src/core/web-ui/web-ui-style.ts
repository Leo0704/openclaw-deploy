const WEB_UI_STYLE = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg-top: #f36b32;
      --bg-mid: #134074;
      --bg-bottom: #08111f;
      --surface: rgba(255,255,255,0.94);
      --surface-strong: #ffffff;
      --surface-soft: #f6f8fc;
      --surface-accent: #fff5ef;
      --text-main: #18212f;
      --text-muted: #5f6b7a;
      --text-soft: #8b95a5;
      --border: rgba(24,33,47,0.08);
      --border-strong: rgba(243,107,50,0.18);
      --brand: #f36b32;
      --brand-dark: #d75621;
      --success: #0f9d72;
      --danger: #e24a4a;
      --warning: #d48a18;
      --shadow: 0 18px 60px rgba(7,15,28,0.18);
      --radius-xl: 22px;
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 10px;
    }
    body {
      font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", system-ui, sans-serif;
      background:
        radial-gradient(circle at top left, rgba(255,255,255,0.2), transparent 28%),
        radial-gradient(circle at top right, rgba(243,107,50,0.22), transparent 24%),
        linear-gradient(155deg, var(--bg-top) 0%, var(--bg-mid) 56%, var(--bg-bottom) 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 920px; margin: 0 auto; }
    .header {
      color: white;
      padding: 22px 0 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }
    .header-main { display: flex; align-items: center; gap: 18px; }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 22px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06));
      border: 1px solid rgba(255,255,255,0.22);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.2),
        0 16px 30px rgba(7,15,28,0.18);
      backdrop-filter: blur(10px);
      padding: 10px;
    }
    .logo svg {
      width: 100%;
      height: 100%;
      display: block;
      filter: drop-shadow(0 10px 18px rgba(127, 27, 27, 0.24));
    }
    .title { font-size: 32px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 4px; }
    .subtitle { opacity: 0.88; font-size: 14px; }
    .version { font-size: 12px; opacity: 0.72; margin-top: 6px; }
    .header-badges { display: flex; gap: 10px; flex-wrap: wrap; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.16);
      color: rgba(255,255,255,0.92);
      font-size: 12px;
      backdrop-filter: blur(10px);
    }
    .card {
      background: var(--surface);
      border-radius: var(--radius-xl);
      padding: 28px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
      border: 1px solid rgba(255,255,255,0.45);
      backdrop-filter: blur(16px);
      animation: fadeUp 0.24s ease-out;
    }
    .card-title {
      font-size: 22px;
      color: var(--text-main);
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
      letter-spacing: -0.02em;
    }
    .card-subtitle { color: var(--text-muted); font-size: 14px; margin: -6px 0 18px; line-height: 1.65; }
    .hero-panel {
      background: linear-gradient(135deg, rgba(243,107,50,0.1), rgba(19,64,116,0.08));
      border: 1px solid var(--border-strong);
      border-radius: 18px;
      padding: 18px 18px 16px;
      margin-bottom: 20px;
    }
    .hero-kicker { font-size: 11px; font-weight: 700; letter-spacing: 0.12em; color: var(--brand-dark); text-transform: uppercase; margin-bottom: 8px; }
    .hero-title { font-size: 20px; font-weight: 800; color: var(--text-main); margin-bottom: 8px; letter-spacing: -0.02em; }
    .hero-copy { color: var(--text-muted); font-size: 14px; line-height: 1.7; }
    .meta-row, .actions, .actions-right, .toolbar, .header-badges { display: flex; flex-wrap: wrap; }
    .meta-row { gap: 10px; margin-top: 14px; }
    .meta-pill, .inline-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.84);
      border: 1px solid var(--border);
      color: var(--text-main);
      font-size: 12px;
    }
    .status-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .status-item {
      padding: 18px;
      background: linear-gradient(180deg, var(--surface-strong), var(--surface-soft));
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
    }
    .status-label { font-size: 12px; color: var(--text-soft); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.08em; }
    .status-value { font-size: 17px; font-weight: 700; color: var(--text-main); line-height: 1.35; }
    .status-value.success { color: var(--success); }
    .status-value.error { color: var(--danger); }
    .status-value.warning { color: var(--warning); }
    .btn {
      padding: 12px 18px;
      border: none;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-decoration: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, var(--brand), var(--brand-dark));
      color: white;
      box-shadow: 0 10px 24px rgba(243,107,50,0.24);
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(243,107,50,0.28); }
    .btn-secondary { background: #edf1f7; color: var(--text-main); border: 1px solid rgba(24,33,47,0.08); }
    .btn-secondary:hover { background: #e4e9f2; }
    .btn-danger { background: linear-gradient(135deg, #ef5350, #d83c3c); color: white; box-shadow: 0 10px 24px rgba(216,60,60,0.18); }
    .btn-danger:hover { transform: translateY(-1px); }
    .btn-small { padding: 8px 16px; font-size: 13px; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .actions { margin-top: 20px; gap: 10px; }
    .actions-right { justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-label { display: block; font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px; }
    .form-helper { font-size: 12px; color: var(--text-soft); margin-top: 6px; line-height: 1.5; }
    .form-input, .form-select {
      width: 100%;
      padding: 13px 14px;
      border: 1px solid rgba(24,33,47,0.1);
      border-radius: 14px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      background: rgba(255,255,255,0.96);
      color: var(--text-main);
    }
    .form-input:focus, .form-select:focus {
      border-color: rgba(243,107,50,0.5);
      box-shadow: 0 0 0 4px rgba(243,107,50,0.12);
      background: white;
    }
    .logs {
      background: linear-gradient(180deg, #101926, #172233);
      border-radius: 16px;
      padding: 18px;
      max-height: 320px;
      overflow-y: auto;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #9CA3AF;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .log-line { margin-bottom: 4px; }
    .log-time { color: #6B7280; }
    .log-info { color: #9CA3AF; }
    .log-error { color: #F87171; }
    .log-success { color: #34D399; }
    .log-warning { color: #FBBF24; }
    .note {
      background: #fff1cc;
      border-radius: 14px;
      padding: 13px 14px;
      margin-bottom: 16px;
      font-size: 14px;
      color: #915b0d;
      border: 1px solid rgba(212,138,24,0.18);
      line-height: 1.6;
    }
    .note-info { background: #e8f1ff; color: #1c4ea5; border-color: rgba(28,78,165,0.14); }
    .note-success { background: #ddf8ee; color: #086247; border-color: rgba(8,98,71,0.12); }
    .footer { text-align: center; color: rgba(255,255,255,0.72); font-size: 12px; margin-top: 20px; }
    #toast { position: fixed; bottom: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; color: white; font-weight: 500; opacity: 0; transition: all 0.3s; z-index: 1000; }
    #toast.show { opacity: 1; }
    #toast.success { background: #10B981; }
    #toast.error { background: #EF4444; }
    #toast.info { background: #3B82F6; }
    .wizard-steps { display: grid; gap: 16px; margin-bottom: 20px; }
    .wizard-step {
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,248,252,0.96));
    }
    .wizard-step-title { font-size: 15px; font-weight: 800; color: var(--text-main); margin-bottom: 10px; letter-spacing: -0.01em; }
    .wizard-step-desc { font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.6; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 700; color: var(--text-soft); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .divider { height: 1px; background: var(--border); margin: 22px 0; }
    .panel {
      background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,252,0.95));
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
    }
    .panel-title { font-size: 15px; font-weight: 800; color: var(--text-main); margin-bottom: 8px; }
    .panel-copy { font-size: 13px; color: var(--text-muted); line-height: 1.6; }
    .update-section { background: linear-gradient(180deg, rgba(246,248,252,0.98), rgba(237,241,247,0.95)); border-radius: 18px; padding: 18px; margin-top: 16px; border: 1px solid var(--border); }
    .update-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #E5E7EB; }
    .update-item:last-child { border-bottom: none; }
    .update-info h4 { font-size: 14px; color: var(--text-main); margin-bottom: 4px; }
    .update-info p { font-size: 12px; color: var(--text-muted); }
    .help-section { background: #F9FAFB; border-radius: 16px; padding: 16px; margin-bottom: 20px; border: 1px solid var(--border); }
    .help-item { padding: 12px 0; border-bottom: 1px solid #E5E7EB; }
    .help-item:last-child { border-bottom: none; }
    .help-title { font-size: 14px; font-weight: 600; color: #1F2937; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .help-content { font-size: 13px; color: #6B7280; line-height: 1.6; }
    .help-content ul { margin: 8px 0 0 20px; }
    .help-content li { margin-bottom: 4px; }
    .help-content code { background: #E5E7EB; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .help-accordion { cursor: pointer; }
    .help-accordion .help-title::after { content: '▼'; font-size: 10px; margin-left: auto; color: #9CA3AF; transition: transform 0.2s; }
    .help-accordion.open .help-title::after { transform: rotate(180deg); }
    .help-accordion .help-content { display: none; }
    .help-accordion.open .help-content { display: block; }
    .support-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
      gap: 18px;
      align-items: center;
      padding: 18px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(243,107,50,0.1), rgba(19,64,116,0.08));
      border: 1px solid var(--border-strong);
      margin-bottom: 20px;
    }
    .support-card img {
      width: 100%;
      max-width: 320px;
      border-radius: 18px;
      border: 1px solid rgba(24,33,47,0.08);
      box-shadow: 0 12px 30px rgba(7,15,28,0.12);
      background: #fff;
      justify-self: end;
    }
    .support-title {
      font-size: 18px;
      font-weight: 800;
      color: var(--text-main);
      margin-bottom: 10px;
    }
    .support-copy {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.7;
      margin-bottom: 12px;
    }
    .support-group-number {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.9);
      border: 1px solid var(--border);
      color: var(--text-main);
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .faq-item { margin-bottom: 16px; }
    .faq-q { font-weight: 600; color: #1F2937; margin-bottom: 4px; }
    .faq-a { color: #6B7280; font-size: 13px; line-height: 1.5; }
    /* Tab 样式 */
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; padding: 8px; border-radius: 16px; background: #f2f5fa; border: 1px solid var(--border); }
    .tab { flex: 1; padding: 12px 16px; border: none; background: transparent; font-size: 14px; font-weight: 700; color: var(--text-soft); cursor: pointer; border-radius: 12px; transition: all 0.2s; }
    .tab:hover { color: var(--brand-dark); background: rgba(255,255,255,0.72); }
    .tab.active { color: var(--brand-dark); background: white; box-shadow: 0 8px 18px rgba(24,33,47,0.06); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    /* 技能卡片 */
    .skill-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (max-width: 500px) { .skill-grid { grid-template-columns: 1fr; } }
    .skill-card { padding: 16px; border: 2px solid #E5E7EB; border-radius: 12px; transition: all 0.2s; }
    .skill-card:hover { border-color: #FF6B35; box-shadow: 0 4px 12px rgba(255,107,53,0.15); }
    .skill-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .skill-icon { font-size: 24px; }
    .skill-name { font-weight: 600; color: #1F2937; font-size: 14px; }
    .skill-desc { font-size: 12px; color: #6B7280; margin-bottom: 10px; line-height: 1.4; }
    .skill-footer { display: flex; justify-content: space-between; align-items: center; }
    .skill-stars { font-size: 12px; color: #F59E0B; }
    .skill-category { font-size: 11px; padding: 2px 8px; background: #F3F4F6; border-radius: 4px; color: #6B7280; }
    .skill-installed { color: #10B981; font-size: 12px; display: flex; align-items: center; gap: 4px; }
    .category-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .category-btn { padding: 6px 12px; border: 1px solid #E5E7EB; border-radius: 20px; background: white; font-size: 12px; color: #6B7280; cursor: pointer; transition: all 0.2s; }
    .category-btn:hover { border-color: #FF6B35; color: #FF6B35; }
    .category-btn.active { background: #FF6B35; color: white; border-color: #FF6B35; }
    .installed-list { margin-top: 20px; }
    .installed-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #F9FAFB; border-radius: 8px; margin-bottom: 8px; }
    .installed-name { font-weight: 500; color: #1F2937; }
    .service-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(260px, 1fr);
      gap: 16px;
      margin-bottom: 18px;
    }
    .service-actions, .service-side { height: 100%; }
    .muted { color: var(--text-muted); }
    .mono { font-family: "SFMono-Regular", Menlo, Monaco, Consolas, monospace; font-size: 12px; }
    .small { font-size: 12px; }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 720px) {
      body { padding: 14px; }
      .card { padding: 20px; border-radius: 18px; }
      .header { padding-top: 10px; }
      .header-main { align-items: flex-start; }
      .service-hero, .status-grid { grid-template-columns: 1fr; }
      .support-card { grid-template-columns: 1fr; }
      .support-card img { justify-self: start; }
      .tabs { flex-direction: column; }
      .tab { width: 100%; }
    }
  `;

export { WEB_UI_STYLE };
