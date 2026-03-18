import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// BRAND COLOURS
// ─────────────────────────────────────────────────────────────────────────────
const B = {
  primaryBlue: "#1F4E79",
  tealBlue:    "#2C7DA0",
  orange:      "#F47C2C",
  redOrange:   "#E94E1B",
  white:       "#FFFFFF",
  lightGray:   "#E6E6E6",
  darkBg:      "#0D1B2A",
  cardBg:      "#162638",
  cardBorder:  "#1F4E79",
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const PIN = "1234";
const LS_KEY = "ssp_departments_v2";

const DEPT_EMOJIS = ["🎨","🔧","🏭","📦","👤","💼","📊","🏗️","⚙️","🖥️","📋","🏢"];

// Default departments — editable by supervisor
const DEFAULT_DEPARTMENTS = [
  { id: "design",       name: "Design",          emoji: "🎨", sheetId: "1ayUXpV37H0-JQkP-QQTQ3mjtcJ7p26jalYDadC6qpg8" },
  { id: "individual",   name: "Individual",       emoji: "👤", sheetId: "1KJQQcOJCkcsFssCyluuKXGnPqtNeFXAeQ6rmAqEtDVg"  },
  { id: "installation", name: "Installation",     emoji: "🔧", sheetId: "1lDl4QYjfivYr4tw1y6XXX50soci0iA3CSlbPaDoeIsU"  },
  { id: "production",   name: "Production",       emoji: "🏭", sheetId: "163_mQeXKI8tAaotEhHuNuwQGqFfha3PeuIuaqSVq0fc"  },
  { id: "store",        name: "Store & Purchase", emoji: "📦", sheetId: "1vWJx3Su8tbAtI0sfhsFJTqhygf65swJUe0EYDUA4SNo"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE FALLBACK DATA (shown if Google Sheets fetch fails)
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_PROCESSES = [
  {
    name: "Sample Process — Client Requirement Collection",
    steps: [
      {
        stage: "Initial Engagement", step: 1,
        name: "Initial Client Meeting",
        input: "Client contact details & project brief",
        process: "Meet the client, understand their vision, budget, and timeline. Ask open-ended questions and take detailed notes.",
        output: "Signed meeting notes document",
        responsible: "Senior Designer", reviewer: "Design Head", tat: "1 Day",
        escalation: "Inform Design Head if client is unresponsive for more than 24 hours",
        tools: "Laptop, Notepad, Meeting agenda template",
        safety: "Always meet clients in office or public spaces. Never visit alone.",
        referenceDoc: "Client Intake Form v3.docx",
        dos: "Arrive 10 mins early. Record meeting with permission. Send summary within 2 hours.",
        donts: "Never promise timelines without Design Head approval. Don't skip the budget discussion.",
        commonMistakes: "Forgetting to ask about site ownership. Not recording client's backup contact.",
        whatIf: "If client changes requirements mid-meeting → pause, document changes, get written confirmation before proceeding.",
        qualityCheck: "Good: Signed notes with client signature, clear budget range. Bad: Verbal agreement only, no documentation.",
      },
      {
        stage: "Initial Engagement", step: 2,
        name: "Requirement Documentation",
        input: "Signed meeting notes",
        process: "Prepare a formal requirement document covering scope, budget, style preferences, and key deadlines.",
        output: "Approved Requirement Document",
        responsible: "Designer", reviewer: "Design Head", tat: "1 Day",
        escalation: "",
        tools: "MS Word, Requirement Template v2",
        safety: "",
        referenceDoc: "Requirement Doc Template.docx",
        dos: "Use standard template. Get client initials on every page.",
        donts: "Don't use informal language. Don't leave any section blank.",
        commonMistakes: "Using old template version. Missing client signature on last page.",
        whatIf: "If client refuses to sign → escalate to Design Head immediately.",
        qualityCheck: "Good: All sections filled, client signed. Bad: Incomplete sections or missing signature.",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS FETCH UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

// Extract sheet ID from a full URL or return as-is if already an ID
function extractSheetId(input) {
  if (!input) return "";
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : input.trim();
}

// Parse Google Visualisation API JSON response (strips the callback wrapper)
function parseGVizResponse(text) {
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Invalid GViz response");
  return JSON.parse(text.substring(start, end + 1));
}

// Fetch all tab/sheet names from a Google Sheet
async function fetchTabNames(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} — check sheet is set to Anyone with link (Viewer)`);
  const text = await res.text();
  const json = parseGVizResponse(text);
  // Tab names are stored as string values in the first column of the metadata table
  const rows = json?.table?.rows || [];
  return rows.map(r => r?.c?.[0]?.v).filter(v => typeof v === "string" && v.trim() !== "");
}

// Fetch all rows from a specific tab and map to step objects
async function fetchTabSteps(sheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const json = parseGVizResponse(text);

  const cols = (json?.table?.cols || []).map(c => (c?.label || "").trim().toUpperCase());
  const rows = (json?.table?.rows || []).map(r => {
    const obj = {};
    (r?.c || []).forEach((cell, i) => {
      obj[cols[i]] = (cell?.v != null ? String(cell.v) : "").trim();
    });
    return obj;
  });

  // Only process rows that have a STEP NAME value
  return rows
    .filter(r => r["STEP NAME"] && r["STEP NAME"] !== "")
    .map((r, idx) => ({
      stage:          r["STAGE"]             || "",
      step:           parseInt(r["STEP"], 10) || idx + 1,
      name:           r["STEP NAME"]         || "",
      input:          r["INPUT"]             || "",
      process:        r["PROCESS"]           || "",
      output:         r["OUTPUT"]            || "",
      responsible:    r["RESPONSIBLE"]       || "",
      reviewer:       r["REVIEWER/APPROVER"] || "",
      tat:            r["TAT"]               || "",
      escalation:     r["ESCALATION"]        || "",
      tools:          r["TOOLS"]             || "",
      safety:         r["SAFETY"]            || "",
      referenceDoc:   r["REFERENCE DOC"]     || "",
      dos:            r["DO'S"]              || "",
      donts:          r["DON'TS"]            || "",
      commonMistakes: r["COMMON MISTAKES"]   || "",
      whatIf:         r["WHAT IF"]           || "",
      qualityCheck:   r["QUALITY CHECK"]     || "",
    }));
}

// Fetch all processes for one department
async function fetchDepartment(dept, addLog) {
  const sheetId = extractSheetId(dept.sheetId);
  if (!sheetId) throw new Error("No Sheet ID configured");

  addLog(`── ${dept.name} (${sheetId.slice(0, 16)}…) ──`);
  const tabs = await fetchTabNames(sheetId);
  addLog(`   tabs found: [${tabs.join(", ")}]`);

  const processes = [];
  for (const tab of tabs) {
    try {
      const steps = await fetchTabSteps(sheetId, tab);
      addLog(`   "${tab}" → ${steps.length} steps`);
      if (steps.length > 0) processes.push({ name: tab, steps });
    } catch (e) {
      addLog(`   "${tab}" error: ${e.message}`);
    }
  }
  return processes;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function tr(en, hi, lang) { return lang === "hi" ? hi : en; }
function has(v) { return typeof v === "string" && v.trim() !== "" && v.trim() !== "-"; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Logo({ center = false }) {
  const big = center;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: big ? 8 : 6 }}>
        <span style={{ color: B.orange, fontSize: big ? 48 : 22, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>3</span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 2 }}>
            {["★","★","★"].map((s, i) => (
              <span key={i} style={{ color: B.orange, fontSize: big ? 20 : 12 }}>{s}</span>
            ))}
          </div>
          <span style={{ color: B.white, fontSize: big ? 24 : 14, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>PROJECTS</span>
        </div>
      </div>
      <div style={{ color: B.lightGray, fontSize: big ? 11 : 9, fontWeight: 600, letterSpacing: 3, opacity: 0.8, textTransform: "uppercase", marginTop: 2 }}>
        Building Excellence
      </div>
    </div>
  );
}

function GradHeader({ children, onBack, lang, setLang }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${B.primaryBlue}, ${B.tealBlue})`, padding: "40px 16px 16px", position: "relative", flexShrink: 0 }}>
      {onBack && (
        <button onClick={onBack} style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,255,255,0.15)", border: "none", color: B.white, fontSize: 20, fontWeight: 900, borderRadius: 10, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
      )}
      {setLang && (
        <button onClick={() => setLang(l => l === "en" ? "hi" : "en")}
          style={{ position: "absolute", top: 14, right: 14, background: B.orange, color: B.white, border: "none", borderRadius: 10, padding: "6px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          {lang === "en" ? "हिंदी" : "EN"}
        </button>
      )}
      {children}
    </div>
  );
}

function OrangeBtn({ onClick, children, outline = false, disabled = false, small = false }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: "100%",
      padding: small ? "13px 0" : "20px 0",
      borderRadius: 18,
      fontSize: small ? 15 : 19,
      fontWeight: 900,
      border: outline ? `2px solid ${B.orange}` : "none",
      background: outline ? "transparent" : `linear-gradient(135deg, ${B.orange}, ${B.redOrange})`,
      color: B.white,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      boxShadow: outline ? "none" : `0 4px 20px ${B.orange}44`,
    }}>{children}</button>
  );
}

function InfoCard({ bg = B.cardBg, border = B.cardBorder, labelColor = B.tealBlue, valColor = B.white, label, children }) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: "13px 15px", border: `1px solid ${border}`, marginBottom: 10 }}>
      <div style={{ color: labelColor, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
      <div style={{ color: valColor, fontSize: 14, fontWeight: 600, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function DebugOverlay({ log, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.97)", zIndex: 9999, display: "flex", flexDirection: "column", padding: 16, overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: B.orange, fontWeight: 800, fontSize: 16 }}>🔍 Fetch Debug Log</span>
        <button onClick={onClose} style={{ background: B.redOrange, border: "none", color: B.white, borderRadius: 8, padding: "6px 18px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>✕ Close</button>
      </div>
      {log.length === 0
        ? <p style={{ color: "#888", fontSize: 13 }}>No log yet. Tap "Refresh SOPs" in the Overview tab first.</p>
        : log.map((line, i) => (
          <div key={i} style={{
            color: line.includes("FAIL") || line.includes("error") || line.includes("Error") ? "#f87171"
                 : line.includes("steps") ? "#86efac"
                 : line.includes("tabs") ? "#fcd34d"
                 : line.includes("✓")    ? "#86efac" : "#ccc",
            fontSize: 11, fontFamily: "monospace", marginBottom: 5, wordBreak: "break-all", lineHeight: 1.6,
          }}>{line}</div>
        ))
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function PinScreen({ onSuccess, onBack, lang }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  function press(k) {
    if (k === "⌫") { setPin(p => p.slice(0, -1)); setErr(false); return; }
    if (pin.length >= 4) return;
    const np = pin + k;
    setPin(np);
    if (np.length === 4) {
      if (np === PIN) { onSuccess(); setPin(""); setErr(false); }
      else { setErr(true); setTimeout(() => { setPin(""); setErr(false); }, 800); }
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: B.darkBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, position: "relative" }}>
      <button onClick={onBack} style={{ position: "absolute", top: 16, left: 16, background: "none", border: "none", color: B.orange, fontSize: 26, fontWeight: 900, cursor: "pointer" }}>←</button>
      <Logo center />
      <div style={{ marginTop: 28, fontSize: 44, marginBottom: 8 }}>🔒</div>
      <h2 style={{ color: B.white, fontSize: 22, fontWeight: 900, marginBottom: 4 }}>{tr("Supervisor PIN", "सुपरवाइजर PIN", lang)}</h2>
      <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>{tr("Enter 4-digit PIN", "4 अंक PIN दर्ज करें", lang)}</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ width: 52, height: 52, borderRadius: 12, background: B.cardBg, border: `2px solid ${pin.length > i ? B.orange : B.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: B.orange, fontWeight: 900 }}>
            {pin.length > i ? "●" : ""}
          </div>
        ))}
      </div>
      {err && <p style={{ color: B.redOrange, fontWeight: 700, marginBottom: 12, fontSize: 14 }}>{tr("Wrong PIN. Try again.", "गलत PIN। फिर कोशिश करें।", lang)}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 12 }}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k, i) => (
          <button key={i} disabled={k === ""} onClick={() => k !== "" && press(String(k))}
            style={{ width: 72, height: 72, borderRadius: 16, background: k === "" ? "transparent" : B.cardBg, border: k === "" ? "none" : `2px solid ${B.cardBorder}`, color: B.orange, fontSize: 24, fontWeight: 900, cursor: k === "" ? "default" : "pointer" }}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP VIEW
// ─────────────────────────────────────────────────────────────────────────────
function StepView({ step, stepNum, total, procName, onNext, onBack, lang, setLang }) {
  const isLast = stepNum === total;
  return (
    <div style={{ minHeight: "100vh", background: B.darkBg, display: "flex", flexDirection: "column" }}>
      <GradHeader onBack={onBack} lang={lang} setLang={setLang}>
        <p style={{ color: B.lightGray, fontSize: 12, marginTop: 4, opacity: 0.7 }}>{procName}</p>
        {has(step.stage) && <p style={{ color: B.orange, fontSize: 11, fontWeight: 700, marginBottom: 2 }}>📍 {step.stage}</p>}
        <h1 style={{ color: B.white, fontSize: 20, fontWeight: 900, lineHeight: 1.3, marginBottom: 10 }}>{step.name}</h1>
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i < stepNum - 1 ? B.orange : i === stepNum - 1 ? B.white : "rgba(255,255,255,0.2)" }} />
          ))}
        </div>
        <p style={{ color: B.lightGray, fontSize: 11, opacity: 0.7 }}>{tr(`Step ${stepNum} of ${total}`, `चरण ${stepNum} / ${total}`, lang)}</p>
      </GradHeader>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0" }}>
        {has(step.process) && (
          <InfoCard label={`⚙️ ${tr("What To Do", "क्या करना है", lang)}`}>{step.process}</InfoCard>
        )}
        {(has(step.input) || has(step.output)) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {has(step.input)  && <InfoCard label={`📥 ${tr("Input",  "इनपुट",   lang)}`} valColor={B.lightGray}>{step.input}</InfoCard>}
            {has(step.output) && <InfoCard label={`📤 ${tr("Output", "आउटपुट",  lang)}`} valColor={B.lightGray}>{step.output}</InfoCard>}
          </div>
        )}
        {has(step.tools)        && <InfoCard bg="#1a2e1a" border="#2d6a2d" labelColor="#4ade80"    valColor="#86efac"  label={`🛠️ ${tr("Tools / Equipment",   "उपकरण",              lang)}`}>{step.tools}</InfoCard>}
        {has(step.safety)       && <InfoCard bg="#2d1a00" border={B.orange} labelColor={B.orange}  valColor="#fed7aa"  label={`⚠️ ${tr("Safety Warning",       "सुरक्षा चेतावनी",   lang)}`}>{step.safety}</InfoCard>}
        {has(step.referenceDoc) && <InfoCard bg="#0f1f35" border={B.tealBlue} labelColor={B.tealBlue} valColor="#93c5fd" label={`📄 ${tr("Reference Document", "संदर्भ दस्तावेज़",   lang)}`}>{step.referenceDoc}</InfoCard>}

        {(has(step.dos) || has(step.donts)) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            {has(step.dos)   && <InfoCard bg="#0d2a15" border="#16a34a"    labelColor="#4ade80"    valColor="#86efac"  label={`✅ ${tr("Do's",   "करें",    lang)}`}>{step.dos}</InfoCard>}
            {has(step.donts) && <InfoCard bg="#2d0f0f" border={B.redOrange} labelColor={B.redOrange} valColor="#fca5a5" label={`❌ ${tr("Don'ts", "न करें", lang)}`}>{step.donts}</InfoCard>}
          </div>
        )}
        {has(step.commonMistakes) && <InfoCard bg="#2a1010" border={B.redOrange} labelColor={B.redOrange} valColor="#fca5a5" label={`🙈 ${tr("Common Mistakes", "आम गलतियाँ",    lang)}`}>{step.commonMistakes}</InfoCard>}
        {has(step.whatIf)         && <InfoCard bg="#0f1f2d" border={B.tealBlue}  labelColor={B.tealBlue}  valColor="#93c5fd"  label={`🤔 ${tr("What If…",       "अगर ऐसा हो…",  lang)}`}>{step.whatIf}</InfoCard>}
        {has(step.qualityCheck)   && <InfoCard bg="#0d2a15" border="#16a34a"     labelColor="#4ade80"     valColor="#86efac"  label={`🏆 ${tr("Quality Check",  "गुणवत्ता जांच", lang)}`}>{step.qualityCheck}</InfoCard>}

        {(has(step.responsible) || has(step.reviewer)) && (
          <div style={{ display: "grid", gridTemplateColumns: has(step.reviewer) ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 10 }}>
            {has(step.responsible) && <InfoCard label={`👤 ${tr("Responsible", "जिम्मेदार", lang)}`}>{step.responsible}</InfoCard>}
            {has(step.reviewer)    && <InfoCard label={`✅ ${tr("Reviewer",    "समीक्षक",   lang)}`}>{step.reviewer}</InfoCard>}
          </div>
        )}
        {has(step.tat) && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1a1500", border: `1px solid ${B.orange}`, borderRadius: 12, padding: "10px 16px", marginBottom: 10 }}>
            <span style={{ fontSize: 20 }}>⏱</span>
            <div>
              <div style={{ color: B.orange, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>TAT</div>
              <div style={{ color: "#fcd34d", fontSize: 16, fontWeight: 700 }}>{step.tat}</div>
            </div>
          </div>
        )}
        {has(step.escalation) && (
          <InfoCard bg="#2d0808" border={B.redOrange} labelColor={B.redOrange} valColor="#fca5a5" label={`🚨 ${tr("If Something Goes Wrong", "अगर कुछ गलत हो", lang)}`}>
            {step.escalation}
          </InfoCard>
        )}
        <div style={{ height: 16 }} />
      </div>

      <div style={{ padding: "12px 14px 28px", background: B.darkBg, borderTop: `1px solid ${B.cardBorder}`, flexShrink: 0 }}>
        <OrangeBtn onClick={onNext}>
          {isLast
            ? `🎉 ${tr("Complete Process", "प्रक्रिया पूर्ण करें", lang)}`
            : `✅ ${tr("Done — Next Step →", "हो गया — अगला चरण →", lang)}`}
        </OrangeBtn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPERVISOR PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SupervisorPanel({ departments, setDepartments, fetchedData, loading, log, onBack, onRefresh }) {
  const [tab, setTab]         = useState("overview");
  const [showLog, setShowLog] = useState(false);

  // Add/Edit department form state
  const [editingDept, setEditingDept] = useState(null); // null | dept object
  const [formName,    setFormName]    = useState("");
  const [formSheetId, setFormSheetId] = useState("");
  const [formEmoji,   setFormEmoji]   = useState("🏢");
  const [formMsg,     setFormMsg]     = useState("");

  function openAddForm() {
    setEditingDept(null);
    setFormName(""); setFormSheetId(""); setFormEmoji("🏢"); setFormMsg("");
  }

  function openEditForm(dept) {
    setEditingDept(dept);
    setFormName(dept.name); setFormSheetId(dept.sheetId); setFormEmoji(dept.emoji); setFormMsg("");
  }

  function saveForm() {
    if (!formName.trim())    { setFormMsg("⚠️ Department name is required."); return; }
    if (!formSheetId.trim()) { setFormMsg("⚠️ Google Sheet ID or URL is required."); return; }
    const sheetId = extractSheetId(formSheetId);
    if (!sheetId)            { setFormMsg("⚠️ Could not extract Sheet ID from the URL."); return; }

    if (editingDept) {
      // Update existing
      setDepartments(ds => ds.map(d => d.id === editingDept.id ? { ...d, name: formName.trim(), sheetId, emoji: formEmoji } : d));
      setFormMsg("✅ Department updated!");
    } else {
      // Add new
      const newDept = { id: uid(), name: formName.trim(), emoji: formEmoji, sheetId };
      setDepartments(ds => [...ds, newDept]);
      setFormMsg("✅ Department added!");
    }
    setTimeout(() => { setFormMsg(""); setEditingDept(null); setFormName(""); setFormSheetId(""); }, 1500);
  }

  function deleteDept(id) {
    if (!window.confirm("Remove this department?")) return;
    setDepartments(ds => ds.filter(d => d.id !== id));
  }

  const tabs = [["overview","📊 Overview"],["manage","➕ Departments"],["columns","📋 Columns"],["qr","📱 QR Codes"]];

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", paddingBottom: 40 }}>
      {showLog && <DebugOverlay log={log} onClose={() => setShowLog(false)} />}

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${B.primaryBlue}, ${B.tealBlue})`, padding: "40px 16px 0", position: "relative" }}>
        <button onClick={onBack} style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,255,255,0.15)", border: "none", color: B.white, fontSize: 20, fontWeight: 900, borderRadius: 10, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
        <button onClick={() => setShowLog(true)} style={{ position: "absolute", top: 14, right: 14, background: B.redOrange, border: "none", color: B.white, fontSize: 11, fontWeight: 800, borderRadius: 10, padding: "6px 12px", cursor: "pointer" }}>🔍 Debug</button>
        <Logo />
        <h1 style={{ color: B.white, fontSize: 22, fontWeight: 900, marginTop: 10 }}>Supervisor Panel</h1>
        <p style={{ color: B.lightGray, fontSize: 13, opacity: 0.8, marginBottom: 14 }}>SOP Library Management</p>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {tabs.map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flexShrink: 0, padding: "9px 12px", borderRadius: "10px 10px 0 0", fontWeight: 700, fontSize: 11, border: "none", cursor: "pointer", background: tab === id ? "#f1f5f9" : "transparent", color: tab === id ? B.primaryBlue : B.lightGray, whiteSpace: "nowrap" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "18px 14px" }}>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div>
            <button onClick={onRefresh}
              style={{ width: "100%", padding: "14px 0", borderRadius: 14, background: `linear-gradient(135deg, ${B.primaryBlue}, ${B.tealBlue})`, color: B.white, fontWeight: 800, fontSize: 15, border: "none", marginBottom: 16, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "⏳ Fetching from Google Sheets…" : "🔄 Refresh SOPs from Google Sheets"}
            </button>
            {departments.map(dept => {
              const d = fetchedData[dept.id];
              return (
                <div key={dept.id} style={{ background: B.white, borderRadius: 16, padding: 16, marginBottom: 12, border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontSize: 28 }}>{dept.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 17, color: B.primaryBlue }}>{dept.name}</div>
                      <div style={{ color: "#64748b", fontSize: 12 }}>
                        {d ? `${d.processes.length} processes · ${d.processes.reduce((a, p) => a + p.steps.length, 0)} steps` : "Not loaded yet"}
                      </div>
                    </div>
                    <div style={{ background: d ? "#dcfce7" : "#fee2e2", color: d ? "#16a34a" : "#dc2626", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {d ? "✓ Live" : "✗ Sample"}
                    </div>
                  </div>
                  {d && d.processes.map(p => (
                    <div key={p.name} style={{ background: "#f8fafc", borderRadius: 10, padding: "7px 12px", marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.steps.length} steps</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── MANAGE DEPARTMENTS ── */}
        {tab === "manage" && (
          <div>
            {/* Add / Edit form */}
            <div style={{ background: B.white, borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0" }}>
              <h3 style={{ fontWeight: 900, color: B.primaryBlue, marginBottom: 12, fontSize: 16 }}>
                {editingDept ? `✏️ Edit — ${editingDept.name}` : "➕ Add New Department"}
              </h3>

              {/* Emoji picker */}
              <label style={{ color: "#374151", fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>Choose Icon</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {DEPT_EMOJIS.map(e => (
                  <button key={e} onClick={() => setFormEmoji(e)}
                    style={{ width: 40, height: 40, borderRadius: 10, fontSize: 20, border: `2px solid ${formEmoji === e ? B.orange : "#e2e8f0"}`, background: formEmoji === e ? "#fff7ed" : "#f8fafc", cursor: "pointer" }}>
                    {e}
                  </button>
                ))}
              </div>

              <label style={{ color: "#374151", fontSize: 13, fontWeight: 700, display: "block", marginBottom: 4 }}>Department Name *</label>
              <input value={formName} onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Accounts, HR, Data"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 15, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />

              <label style={{ color: "#374151", fontSize: 13, fontWeight: 700, display: "block", marginBottom: 4 }}>Google Sheet ID or Full URL *</label>
              <input value={formSheetId} onChange={e => setFormSheetId(e.target.value)}
                placeholder="Paste full URL or just the Sheet ID"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 13, fontFamily: "monospace", outline: "none", marginBottom: 6, boxSizing: "border-box" }} />
              <p style={{ color: "#94a3b8", fontSize: 11, marginBottom: 14 }}>
                Sheet must be set to <strong>Anyone with the link → Viewer</strong>
              </p>

              {formMsg && (
                <p style={{ color: formMsg.startsWith("✅") ? "#16a34a" : "#dc2626", fontWeight: 700, marginBottom: 10, fontSize: 14 }}>{formMsg}</p>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <OrangeBtn small onClick={saveForm}>{editingDept ? "💾 Update" : "➕ Add Department"}</OrangeBtn>
                {editingDept && (
                  <button onClick={() => { setEditingDept(null); setFormName(""); setFormSheetId(""); setFormMsg(""); }}
                    style={{ flex: 1, padding: "13px 0", borderRadius: 14, background: "#f1f5f9", color: "#64748b", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14 }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Department list */}
            <h3 style={{ fontWeight: 800, color: "#374151", marginBottom: 10, fontSize: 15 }}>Current Departments ({departments.length})</h3>
            {departments.map(dept => (
              <div key={dept.id} style={{ background: B.white, borderRadius: 14, padding: "14px 16px", marginBottom: 10, border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 26 }}>{dept.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: B.primaryBlue }}>{dept.name}</div>
                  <div style={{ color: "#94a3b8", fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dept.sheetId}</div>
                </div>
                <button onClick={() => openEditForm(dept)}
                  style={{ background: "#eff6ff", border: "none", color: B.primaryBlue, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✏️</button>
                <button onClick={() => deleteDept(dept.id)}
                  style={{ background: "#fee2e2", border: "none", color: "#dc2626", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🗑</button>
              </div>
            ))}
          </div>
        )}

        {/* ── COLUMNS GUIDE ── */}
        {tab === "columns" && (
          <div style={{ background: B.white, borderRadius: 16, padding: 16, border: "1px solid #e2e8f0" }}>
            <h3 style={{ fontWeight: 900, color: B.primaryBlue, marginBottom: 4 }}>Required Google Sheet Column Headers</h3>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>Row 1 of every sheet tab must have these exact headers:</p>
            {[
              ["STAGE",            "Group name (e.g. Site Assessment)"],
              ["STEP",             "Step number (1, 2, 3…)"],
              ["STEP NAME",        "Name of this step — REQUIRED"],
              ["INPUT",            "What is needed to start this step"],
              ["PROCESS",          "What action the worker must perform"],
              ["OUTPUT",           "What is produced after this step"],
              ["RESPONSIBLE",      "Who performs this step"],
              ["REVIEWER/APPROVER","Who reviews or approves"],
              ["TAT",              "Time allowed (e.g. 1 Day, 2 Hours)"],
              ["ESCALATION",       "What to do if something goes wrong"],
              ["NEXT STEP TRIGGER","What triggers the next step"],
              ["TOOLS",            "Equipment or software needed"],
              ["SAFETY",           "Safety warnings for the worker"],
              ["REFERENCE DOC",    "File name or document link"],
              ["DO'S",             "What the worker must always do"],
              ["DON'TS",           "What the worker must never do"],
              ["COMMON MISTAKES",  "Frequent errors to avoid"],
              ["WHAT IF",          "Scenario-based guidance if things go wrong"],
              ["QUALITY CHECK",    "What good output looks like vs bad"],
            ].map(([col, desc]) => (
              <div key={col} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <code style={{ background: "#eff6ff", color: B.primaryBlue, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{col}</code>
                <span style={{ color: "#64748b", fontSize: 13 }}>{desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── QR CODES ── */}
        {tab === "qr" && (
          <div>
            <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>Print and stick on department walls. Workers scan to access SOPs instantly.</p>
            {departments.map(dept => (
              <div key={dept.id} style={{ background: B.white, borderRadius: 20, padding: 20, marginBottom: 16, border: "1px solid #e2e8f0", textAlign: "center" }}>
                <Logo center />
                <div style={{ fontSize: 36, margin: "12px 0 4px" }}>{dept.emoji}</div>
                <h3 style={{ fontWeight: 900, fontSize: 20, color: B.primaryBlue, marginBottom: 2 }}>{dept.name} Department</h3>
                <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 14 }}>Scan to view SOPs</p>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`3 Star Projects SOP Library — ${dept.name}`)}`}
                    width={160} height={160} style={{ borderRadius: 12 }} alt={`QR for ${dept.name}`}
                  />
                </div>
                <p style={{ color: "#cbd5e1", fontSize: 11 }}>3 STAR PROJECTS · Building Excellence</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [lang, setLang]     = useState("en");
  const [screen, setScreen] = useState("home");

  // Departments config — persisted to localStorage
  const [departments, setDepartmentsRaw] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_DEPARTMENTS;
    } catch { return DEFAULT_DEPARTMENTS; }
  });

  function setDepartments(updater) {
    setDepartmentsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Fetched SOP data — keyed by dept.id
  const [fetchedData, setFetchedData] = useState({});
  const [loading, setLoading]         = useState(false);
  const [log, setLog]                 = useState([]);

  // Navigation state
  const [selectedDeptId,  setSelectedDeptId]  = useState(null);
  const [selectedProc,    setSelectedProc]    = useState(null);
  const [stepIdx,         setStepIdx]         = useState(0);

  const addLog = useCallback(msg => setLog(l => [...l, msg]), []);

  const loadFromSheets = useCallback(async () => {
    setLoading(true);
    setLog([]);
    const newData = {};
    for (const dept of departments) {
      try {
        const processes = await fetchDepartment(dept, addLog);
        if (processes.length > 0) {
          newData[dept.id] = { processes };
          addLog(`   ✓ ${dept.name}: ${processes.length} processes loaded`);
        } else {
          addLog(`   ✗ ${dept.name}: no steps found — using sample`);
          newData[dept.id] = { processes: SAMPLE_PROCESSES };
        }
      } catch (e) {
        addLog(`   FAILED ${dept.name}: ${e.message}`);
        newData[dept.id] = { processes: SAMPLE_PROCESSES };
      }
    }
    setFetchedData(newData);
    setLoading(false);
    addLog("── All done ──");
  }, [departments, addLog]);

  // Auto-fetch on mount
  useEffect(() => { loadFromSheets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived
  const selectedDept  = departments.find(d => d.id === selectedDeptId);
  const deptData      = selectedDeptId ? fetchedData[selectedDeptId] : null;
  const procObj       = deptData?.processes?.find(p => p.name === selectedProc);
  const steps         = procObj?.steps || [];
  const step          = steps[stepIdx];

  function goToDept(deptId) {
    setSelectedDeptId(deptId);
    const procs = fetchedData[deptId]?.processes || [];
    if (procs.length === 1) {
      setSelectedProc(procs[0].name);
      setStepIdx(0);
      setScreen("steps");
    } else {
      setScreen("procs");
    }
  }

  // ── RENDER ──
  if (screen === "pin") {
    return <PinScreen lang={lang} onBack={() => setScreen("home")} onSuccess={() => setScreen("supervisor")} />;
  }

  if (screen === "supervisor") {
    return (
      <SupervisorPanel
        departments={departments}
        setDepartments={setDepartments}
        fetchedData={fetchedData}
        loading={loading}
        log={log}
        onBack={() => setScreen("home")}
        onRefresh={loadFromSheets}
      />
    );
  }

  if (screen === "step" && step) {
    return (
      <StepView
        step={step} stepNum={stepIdx + 1} total={steps.length}
        procName={selectedProc} lang={lang} setLang={setLang}
        onBack={() => setScreen("steps")}
        onNext={() => {
          if (stepIdx < steps.length - 1) setStepIdx(i => i + 1);
          else setScreen("done");
        }}
      />
    );
  }

  if (screen === "done") {
    return (
      <div style={{ minHeight: "100vh", background: B.darkBg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Logo center />
        <div style={{ fontSize: 72, margin: "24px 0 12px" }}>🎉</div>
        <h1 style={{ color: B.orange, fontSize: 28, fontWeight: 900, textAlign: "center", marginBottom: 6 }}>{tr("Process Complete!", "प्रक्रिया पूर्ण!", lang)}</h1>
        <p style={{ color: B.lightGray, fontSize: 15, textAlign: "center", marginBottom: 8 }}>{selectedProc}</p>
        <p style={{ color: "#555", fontSize: 14, textAlign: "center", marginBottom: 36 }}>{tr("All steps done. Great work!", "सभी चरण पूर्ण। शाबाश!", lang)}</p>
        <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          <OrangeBtn onClick={() => { setScreen("steps"); setStepIdx(0); }}>{tr("← Back to Process", "← प्रक्रिया पर वापस", lang)}</OrangeBtn>
          <OrangeBtn outline onClick={() => setScreen("home")}>🏠 {tr("Home", "होम", lang)}</OrangeBtn>
        </div>
      </div>
    );
  }

  if (screen === "steps") {
    return (
      <div style={{ minHeight: "100vh", background: B.darkBg }}>
        <GradHeader onBack={() => setScreen(deptData?.processes?.length > 1 ? "procs" : "depts")} lang={lang} setLang={setLang}>
          <p style={{ color: B.lightGray, fontSize: 13, opacity: 0.7, marginTop: 4 }}>{selectedDept?.name}</p>
          <h1 style={{ color: B.white, fontSize: 21, fontWeight: 900, marginBottom: 2 }}>{selectedProc}</h1>
          <p style={{ color: B.lightGray, fontSize: 13, opacity: 0.7 }}>{steps.length} {tr("steps", "चरण", lang)}</p>
        </GradHeader>
        <div style={{ padding: "16px 14px" }}>
          {steps.map((s, i) => (
            <button key={i} onClick={() => { setStepIdx(i); setScreen("step"); }}
              style={{ width: "100%", background: B.cardBg, border: `1px solid ${B.cardBorder}`, borderRadius: 16, padding: 16, marginBottom: 10, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${B.orange}, ${B.redOrange})`, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: B.white, fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{s.name}</div>
                {has(s.stage)       && <div style={{ color: B.tealBlue, fontSize: 12, marginTop: 2 }}>📍 {s.stage}</div>}
                {has(s.responsible) && <div style={{ color: "#888", fontSize: 12 }}>👤 {s.responsible}</div>}
              </div>
              {has(s.tat) && (
                <span style={{ background: "#1a1500", border: `1px solid ${B.orange}`, color: B.orange, borderRadius: 10, padding: "4px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>⏱ {s.tat}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === "procs") {
    return (
      <div style={{ minHeight: "100vh", background: B.darkBg }}>
        <GradHeader onBack={() => setScreen("depts")} lang={lang} setLang={setLang}>
          <p style={{ color: B.lightGray, fontSize: 13, opacity: 0.7, marginTop: 4 }}>{selectedDept?.name}</p>
          <h1 style={{ color: B.white, fontSize: 22, fontWeight: 900 }}>{tr("Select Process", "प्रक्रिया चुनें", lang)}</h1>
        </GradHeader>
        <div style={{ padding: "16px 14px" }}>
          {(deptData?.processes || []).map((proc, i) => (
            <button key={proc.name} onClick={() => { setSelectedProc(proc.name); setStepIdx(0); setScreen("steps"); }}
              style={{ width: "100%", background: B.cardBg, border: `1px solid ${B.cardBorder}`, borderRadius: 20, padding: 18, marginBottom: 12, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${B.orange}, ${B.redOrange})`, color: B.white, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: B.white, fontSize: 17, fontWeight: 800 }}>{proc.name}</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>{proc.steps.length} {tr("steps", "चरण", lang)}</div>
              </div>
              <span style={{ color: B.tealBlue, fontSize: 22 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (screen === "depts") {
    return (
      <div style={{ minHeight: "100vh", background: B.darkBg }}>
        <GradHeader onBack={() => setScreen("home")} lang={lang} setLang={setLang}>
          <h1 style={{ color: B.white, fontSize: 24, fontWeight: 900, marginTop: 4 }}>{tr("Select Department", "विभाग चुनें", lang)}</h1>
          <p style={{ color: B.lightGray, fontSize: 14, opacity: 0.8 }}>{tr("Which area do you work in?", "आप किस क्षेत्र में काम करते हैं?", lang)}</p>
        </GradHeader>
        <div style={{ padding: "16px 14px" }}>
          {departments.map(dept => (
            <button key={dept.id} onClick={() => goToDept(dept.id)}
              style={{ width: "100%", background: B.cardBg, border: `1px solid ${B.cardBorder}`, borderRadius: 20, padding: 18, marginBottom: 12, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 32 }}>{dept.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: B.orange, fontSize: 19, fontWeight: 900 }}>{dept.name}</div>
                <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>
                  {fetchedData[dept.id] ? `${fetchedData[dept.id].processes.length} ${tr("processes", "प्रक्रियाएं", lang)}` : tr("Loading…", "लोड हो रहा है…", lang)}
                </div>
              </div>
              <span style={{ color: B.tealBlue, fontSize: 22 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── HOME SCREEN ──
  return (
    <div style={{ minHeight: "100vh", background: B.darkBg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: `linear-gradient(135deg, ${B.primaryBlue}, ${B.tealBlue})`, padding: "52px 24px 36px", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        <button onClick={() => setLang(l => l === "en" ? "hi" : "en")}
          style={{ position: "absolute", top: 16, right: 16, background: B.orange, color: B.white, border: "none", borderRadius: 10, padding: "7px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          {lang === "en" ? "हिंदी" : "English"}
        </button>
        {loading && (
          <div style={{ position: "absolute", top: 20, left: 16, color: B.lightGray, fontSize: 12, opacity: 0.8 }}>⏳ Loading SOPs…</div>
        )}
        {/* Big logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ color: B.orange, fontSize: 52, fontWeight: 900, letterSpacing: -2, lineHeight: 1 }}>3</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {["★","★","★"].map((s, i) => <span key={i} style={{ color: B.orange, fontSize: 22 }}>{s}</span>)}
            </div>
            <span style={{ color: B.white, fontSize: 26, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>PROJECTS</span>
          </div>
        </div>
        <div style={{ color: B.lightGray, fontSize: 12, fontWeight: 600, letterSpacing: 4, opacity: 0.8, textTransform: "uppercase" }}>Building Excellence</div>
        <div style={{ width: 48, height: 3, background: B.orange, borderRadius: 2, margin: "18px 0 14px" }} />
        <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "7px 18px" }}>
          <span style={{ color: B.white, fontSize: 14, fontWeight: 700 }}>📋 {tr("SOP Library", "SOP लाइब्रेरी", lang)}</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 24px", gap: 16 }}>
        <OrangeBtn onClick={() => setScreen("depts")}>👷 {tr("Worker — View SOPs", "कर्मचारी — SOP देखें", lang)}</OrangeBtn>
        <OrangeBtn outline onClick={() => setScreen("pin")}>🔧 {tr("Supervisor Panel", "सुपरवाइजर पैनल", lang)}</OrangeBtn>
      </div>

      <div style={{ textAlign: "center", padding: "0 0 24px", color: "#333", fontSize: 11 }}>
        3 STAR PROJECTS · {tr("Building Excellence", "बिल्डिंग एक्सीलेंस", lang)}
      </div>
    </div>
  );
}
