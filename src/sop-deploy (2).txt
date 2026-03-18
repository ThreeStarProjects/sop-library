/* eslint-disable */
import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// BRAND
// ─────────────────────────────────────────────────────────────────────────────
var B = {
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
var PIN = "1234";
var LS_DEPTS_KEY = "ssp_departments_v3";

var DEPT_EMOJIS = ["🎨","🔧","🏭","📦","👤","💼","📊","🏗️","⚙️","🖥️","📋","🏢"];

var DEFAULT_DEPARTMENTS = [
  { id: "design",       name: "Design",          emoji: "🎨", sheetId: "1ayUXpV37H0-JQkP-QQTQ3mjtcJ7p26jalYDadC6qpg8" },
  { id: "individual",   name: "Individual",       emoji: "👤", sheetId: "1KJQQcOJCkcsFssCyluuKXGnPqtNeFXAeQ6rmAqEtDVg"  },
  { id: "installation", name: "Installation",     emoji: "🔧", sheetId: "1lDl4QYjfivYr4tw1y6XXX50soci0iA3CSlbPaDoeIsU"  },
  { id: "production",   name: "Production",       emoji: "🏭", sheetId: "163_mQeXKI8tAaotEhHuNuwQGqFfha3PeuIuaqSVq0fc"  },
  { id: "store",        name: "Store & Purchase", emoji: "📦", sheetId: "1vWJx3Su8tbAtI0sfhsFJTqhygf65swJUe0EYDUA4SNo"  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE FALLBACK DATA
// ─────────────────────────────────────────────────────────────────────────────
var SAMPLE_PROCESSES = [
  {
    name: "Sample — Client Requirement Collection",
    steps: [
      {
        stage: "Initial Engagement", step: 1,
        name: "Initial Client Meeting",
        input: "Client contact details and project brief",
        process: "Meet the client. Understand vision, budget and timeline. Ask open questions. Take detailed notes.",
        output: "Signed meeting notes document",
        responsible: "Senior Designer", reviewer: "Design Head", tat: "1 Day",
        escalation: "Inform Design Head if client is unresponsive for more than 24 hours",
        tools: "Laptop, Notepad, Meeting agenda template",
        safety: "Always meet clients in office or public spaces. Never visit alone.",
        referenceDoc: "Client Intake Form v3.docx",
        dos: "Arrive 10 mins early. Send summary within 2 hours.",
        donts: "Never promise timelines without approval. Do not skip the budget discussion.",
        commonMistakes: "Forgetting to ask about site ownership.",
        whatIf: "If client changes requirements mid-meeting, pause and get written confirmation.",
        qualityCheck: "Good: Signed notes with clear budget. Bad: Verbal agreement only.",
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function extractSheetId(input) {
  if (!input) return "";
  var match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : input.trim();
}

function parseGViz(text) {
  var start = text.indexOf("{");
  var end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Invalid response from Google Sheets");
  return JSON.parse(text.substring(start, end + 1));
}

// Fetch actual sheet tab names from the Google Sheets HTML export
// The gviz endpoint is unreliable for tab names — it returns column headers instead
// We use the HTML version which embeds tab names in the page
async function fetchTabNames(sheetId) {
  // Fetch the exported HTML version of the spreadsheet
  // This reliably contains all sheet tab names
  var url = "https://docs.google.com/spreadsheets/d/" + sheetId + "/htmlview";
  var res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " — make sure sheet is set to Anyone with link Viewer");
  var html = await res.text();

  // Tab names are embedded in the HTML as aria-label or data-name attributes on sheet buttons
  // Pattern 1: <li id="sheetN" ...><span ...>TAB NAME</span>
  // Pattern 2: data-name="TAB NAME"
  var tabNames = [];
  var seen = {};

  // Try data-name attribute first (most reliable)
  var dataNamePattern = /data-name="([^"]+)"/g;
  var m;
  while ((m = dataNamePattern.exec(html)) !== null) {
    var name = m[1].trim();
    if (name && !seen[name]) {
      seen[name] = true;
      tabNames.push(name);
    }
  }

  // Fallback: try aria-label on sheet tabs
  if (tabNames.length === 0) {
    var ariaPattern = /aria-label="([^"]+)"/g;
    while ((m = ariaPattern.exec(html)) !== null) {
      var n = m[1].trim();
      // Filter out non-tab aria labels (buttons, links etc.)
      if (n && n.length < 100 && !seen[n] &&
          n.indexOf("http") === -1 &&
          n.indexOf("Google") === -1) {
        seen[n] = true;
        tabNames.push(n);
      }
    }
  }

  // Fallback: look for sheet names in the JS payload inside the HTML
  if (tabNames.length === 0) {
    var jsPattern = /"name":"([^"]{1,80})"/g;
    while ((m = jsPattern.exec(html)) !== null) {
      var nm = m[1].trim();
      if (nm && !seen[nm] &&
          nm !== "string" && nm !== "number" && nm !== "boolean" &&
          nm !== "date" && nm !== "datetime" && nm !== "timeofday") {
        seen[nm] = true;
        tabNames.push(nm);
      }
    }
  }

  return tabNames;
}

async function fetchTabSteps(sheetId, tabName) {
  var url = "https://docs.google.com/spreadsheets/d/" + sheetId + "/gviz/tq?tqx=out:json&sheet=" + encodeURIComponent(tabName);
  var res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  var json = parseGViz(await res.text());
  var cols = (json && json.table && json.table.cols ? json.table.cols : [])
    .map(function(c) { return c && c.label ? c.label.trim().toUpperCase() : ""; });
  var rows = (json && json.table && json.table.rows ? json.table.rows : [])
    .map(function(r) {
      var obj = {};
      (r && r.c ? r.c : []).forEach(function(cell, i) {
        obj[cols[i]] = cell && cell.v != null ? String(cell.v).trim() : "";
      });
      return obj;
    })
    .filter(function(r) { return r["STEP NAME"] && r["STEP NAME"] !== ""; });
  return rows.map(function(r, idx) {
    return {
      stage:          r["STAGE"]             || "",
      step:           parseInt(r["STEP"], 10) || idx + 1,
      name:           r["STEP NAME"]          || "",
      input:          r["INPUT"]              || "",
      process:        r["PROCESS"]            || "",
      output:         r["OUTPUT"]             || "",
      responsible:    r["RESPONSIBLE"]        || "",
      reviewer:       r["REVIEWER/APPROVER"]  || "",
      tat:            r["TAT"]                || "",
      escalation:     r["ESCALATION"]         || "",
      tools:          r["TOOLS"]              || "",
      safety:         r["SAFETY"]             || "",
      referenceDoc:   r["REFERENCE DOC"]      || "",
      dos:            r["DO'S"]               || "",
      donts:          r["DON'TS"]             || "",
      commonMistakes: r["COMMON MISTAKES"]    || "",
      whatIf:         r["WHAT IF"]            || "",
      qualityCheck:   r["QUALITY CHECK"]      || "",
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function tr(en, hi, lang) { return lang === "hi" ? hi : en; }
function has(v) { return typeof v === "string" && v.trim() !== "" && v.trim() !== "-"; }
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function loadDepts() {
  try {
    var saved = localStorage.getItem(LS_DEPTS_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return DEFAULT_DEPARTMENTS;
}

function saveDepts(depts) {
  try { localStorage.setItem(LS_DEPTS_KEY, JSON.stringify(depts)); } catch(e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function Logo(props) {
  var center = props.center || false;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems: center ? "center" : "flex-start" }}>
      <div style={{ display:"flex", alignItems:"center", gap: center ? 8 : 6 }}>
        <span style={{ color:B.orange, fontSize: center ? 48 : 22, fontWeight:900, letterSpacing:-2, lineHeight:1 }}>3</span>
        <div style={{ display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", gap:2 }}>
            <span style={{ color:B.orange, fontSize: center ? 20 : 12 }}>★</span>
            <span style={{ color:B.orange, fontSize: center ? 20 : 12 }}>★</span>
            <span style={{ color:B.orange, fontSize: center ? 20 : 12 }}>★</span>
          </div>
          <span style={{ color:B.white, fontSize: center ? 24 : 14, fontWeight:900, letterSpacing:2, lineHeight:1 }}>PROJECTS</span>
        </div>
      </div>
      <div style={{ color:B.lightGray, fontSize: center ? 11 : 9, fontWeight:600, letterSpacing:3, opacity:0.8, textTransform:"uppercase", marginTop:2 }}>
        Building Excellence
      </div>
    </div>
  );
}

function GradHeader(props) {
  return (
    <div style={{ background:"linear-gradient(135deg," + B.primaryBlue + "," + B.tealBlue + ")", padding:"40px 16px 16px", position:"relative", flexShrink:0 }}>
      {props.onBack && (
        <button onClick={props.onBack} style={{ position:"absolute", top:14, left:14, background:"rgba(255,255,255,0.15)", border:"none", color:B.white, fontSize:20, fontWeight:900, borderRadius:10, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
      )}
      {props.setLang && (
        <button onClick={function(){ props.setLang(function(l){ return l === "en" ? "hi" : "en"; }); }}
          style={{ position:"absolute", top:14, right:14, background:B.orange, color:B.white, border:"none", borderRadius:10, padding:"6px 14px", fontWeight:800, fontSize:12, cursor:"pointer" }}>
          {props.lang === "en" ? "हिंदी" : "EN"}
        </button>
      )}
      {props.children}
    </div>
  );
}

function OrangeBtn(props) {
  return (
    <button onClick={props.onClick} disabled={props.disabled || false} style={{
      width:"100%",
      padding: props.small ? "13px 0" : "20px 0",
      borderRadius:18,
      fontSize: props.small ? 15 : 19,
      fontWeight:900,
      border: props.outline ? "2px solid " + B.orange : "none",
      background: props.outline ? "transparent" : "linear-gradient(135deg," + B.orange + "," + B.redOrange + ")",
      color:B.white,
      cursor: props.disabled ? "not-allowed" : "pointer",
      opacity: props.disabled ? 0.4 : 1,
      boxShadow: props.outline ? "none" : "0 4px 20px " + B.orange + "44",
    }}>
      {props.children}
    </button>
  );
}

function InfoCard(props) {
  return (
    <div style={{ background: props.bg || B.cardBg, borderRadius:14, padding:"13px 15px", border:"1px solid " + (props.border || B.cardBorder), marginBottom:10 }}>
      <div style={{ color: props.labelColor || B.tealBlue, fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1.2, marginBottom:4 }}>{props.label}</div>
      <div style={{ color: props.valColor || B.white, fontSize:14, fontWeight:600, lineHeight:1.6 }}>{props.children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
function DebugOverlay(props) {
  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.97)", zIndex:9999, display:"flex", flexDirection:"column", padding:16, overflowY:"auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ color:B.orange, fontWeight:800, fontSize:16 }}>🔍 Fetch Debug Log</span>
        <button onClick={props.onClose} style={{ background:B.redOrange, border:"none", color:B.white, borderRadius:8, padding:"6px 18px", fontWeight:700, cursor:"pointer", fontSize:14 }}>✕ Close</button>
      </div>
      {props.log.length === 0
        ? <p style={{ color:"#888", fontSize:13 }}>No log yet. Tap Refresh in Overview tab first.</p>
        : props.log.map(function(line, i) {
          var color = "#ccc";
          if (line.indexOf("FAIL") !== -1 || line.indexOf("error") !== -1) color = "#f87171";
          else if (line.indexOf("steps") !== -1 || line.indexOf("✓") !== -1) color = "#86efac";
          else if (line.indexOf("tabs") !== -1) color = "#fcd34d";
          return <div key={i} style={{ color:color, fontSize:11, fontFamily:"monospace", marginBottom:5, wordBreak:"break-all", lineHeight:1.6 }}>{line}</div>;
        })
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function PinScreen(props) {
  var lang = props.lang;
  var pin = props.pin;
  var setPin = props.setPin;
  var err = props.err;
  var setErr = props.setErr;
  var onSuccess = props.onSuccess;
  var onBack = props.onBack;
  var keys = [1,2,3,4,5,6,7,8,9,"",0,"⌫"];

  function press(k) {
    if (k === "⌫") { setPin(function(p){ return p.slice(0,-1); }); setErr(false); return; }
    if (pin.length >= 4) return;
    var np = pin + k;
    setPin(np);
    if (np.length === 4) {
      if (np === PIN) { onSuccess(); setPin(""); setErr(false); }
      else { setErr(true); setTimeout(function(){ setPin(""); setErr(false); }, 800); }
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:B.darkBg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, position:"relative" }}>
      <button onClick={onBack} style={{ position:"absolute", top:16, left:16, background:"none", border:"none", color:B.orange, fontSize:26, fontWeight:900, cursor:"pointer" }}>←</button>
      <Logo center={true} />
      <div style={{ marginTop:28, fontSize:44, marginBottom:8 }}>🔒</div>
      <h2 style={{ color:B.white, fontSize:22, fontWeight:900, marginBottom:4 }}>{tr("Supervisor PIN","सुपरवाइजर PIN",lang)}</h2>
      <p style={{ color:"#888", fontSize:14, marginBottom:24 }}>{tr("Enter 4-digit PIN","4 अंक PIN दर्ज करें",lang)}</p>
      <div style={{ display:"flex", gap:12, marginBottom:16 }}>
        {[0,1,2,3].map(function(i){
          return (
            <div key={i} style={{ width:52, height:52, borderRadius:12, background:B.cardBg, border:"2px solid " + (pin.length > i ? B.orange : B.cardBorder), display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:B.orange, fontWeight:900 }}>
              {pin.length > i ? "●" : ""}
            </div>
          );
        })}
      </div>
      {err && <p style={{ color:B.redOrange, fontWeight:700, marginBottom:12, fontSize:14 }}>{tr("Wrong PIN. Try again.","गलत PIN। फिर कोशिश करें।",lang)}</p>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 72px)", gap:12 }}>
        {keys.map(function(k, i){
          return (
            <button key={i} disabled={k === ""} onClick={function(){ if (k !== "") press(String(k)); }}
              style={{ width:72, height:72, borderRadius:16, background: k === "" ? "transparent" : B.cardBg, border: k === "" ? "none" : "2px solid " + B.cardBorder, color:B.orange, fontSize:24, fontWeight:900, cursor: k === "" ? "default" : "pointer" }}>
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP VIEW
// ─────────────────────────────────────────────────────────────────────────────
function StepView(props) {
  var step = props.step;
  var stepNum = props.stepNum;
  var total = props.total;
  var procName = props.procName;
  var lang = props.lang;
  var setLang = props.setLang;
  var onNext = props.onNext;
  var onBack = props.onBack;
  var isLast = stepNum === total;

  var bars = [];
  for (var b = 0; b < total; b++) {
    bars.push(<div key={b} style={{ flex:1, height:5, borderRadius:4, background: b < stepNum-1 ? B.orange : b === stepNum-1 ? B.white : "rgba(255,255,255,0.2)" }} />);
  }

  return (
    <div style={{ minHeight:"100vh", background:B.darkBg, display:"flex", flexDirection:"column" }}>
      <GradHeader onBack={onBack} lang={lang} setLang={setLang}>
        <p style={{ color:B.lightGray, fontSize:12, marginTop:4, opacity:0.7 }}>{procName}</p>
        {has(step.stage) && <p style={{ color:B.orange, fontSize:11, fontWeight:700, marginBottom:2 }}>📍 {step.stage}</p>}
        <h1 style={{ color:B.white, fontSize:20, fontWeight:900, lineHeight:1.3, marginBottom:10 }}>{step.name}</h1>
        <div style={{ display:"flex", gap:4, marginBottom:4 }}>{bars}</div>
        <p style={{ color:B.lightGray, fontSize:11, opacity:0.7 }}>{tr("Step " + stepNum + " of " + total,"चरण " + stepNum + " / " + total,lang)}</p>
      </GradHeader>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 14px 0" }}>
        {has(step.process)       && <InfoCard label={"⚙️ " + tr("What To Do","क्या करना है",lang)}>{step.process}</InfoCard>}
        {(has(step.input) || has(step.output)) && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            {has(step.input)  && <InfoCard label={"📥 " + tr("Input","इनपुट",lang)}   valColor={B.lightGray}>{step.input}</InfoCard>}
            {has(step.output) && <InfoCard label={"📤 " + tr("Output","आउटपुट",lang)} valColor={B.lightGray}>{step.output}</InfoCard>}
          </div>
        )}
        {has(step.tools)        && <InfoCard bg="#1a2e1a" border="#2d6a2d" labelColor="#4ade80"    valColor="#86efac"  label={"🛠️ " + tr("Tools","उपकरण",lang)}>{step.tools}</InfoCard>}
        {has(step.safety)       && <InfoCard bg="#2d1a00" border={B.orange} labelColor={B.orange}  valColor="#fed7aa"  label={"⚠️ " + tr("Safety Warning","सुरक्षा चेतावनी",lang)}>{step.safety}</InfoCard>}
        {has(step.referenceDoc) && <InfoCard bg="#0f1f35" border={B.tealBlue} labelColor={B.tealBlue} valColor="#93c5fd" label={"📄 " + tr("Reference Doc","संदर्भ दस्तावेज़",lang)}>{step.referenceDoc}</InfoCard>}
        {(has(step.dos) || has(step.donts)) && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            {has(step.dos)   && <InfoCard bg="#0d2a15" border="#16a34a"    labelColor="#4ade80"    valColor="#86efac"  label={"✅ " + tr("Do's","करें",lang)}>{step.dos}</InfoCard>}
            {has(step.donts) && <InfoCard bg="#2d0f0f" border={B.redOrange} labelColor={B.redOrange} valColor="#fca5a5" label={"❌ " + tr("Don'ts","न करें",lang)}>{step.donts}</InfoCard>}
          </div>
        )}
        {has(step.commonMistakes) && <InfoCard bg="#2a1010" border={B.redOrange} labelColor={B.redOrange} valColor="#fca5a5" label={"🙈 " + tr("Common Mistakes","आम गलतियाँ",lang)}>{step.commonMistakes}</InfoCard>}
        {has(step.whatIf)         && <InfoCard bg="#0f1f2d" border={B.tealBlue}  labelColor={B.tealBlue}  valColor="#93c5fd"  label={"🤔 " + tr("What If","अगर ऐसा हो",lang)}>{step.whatIf}</InfoCard>}
        {has(step.qualityCheck)   && <InfoCard bg="#0d2a15" border="#16a34a"     labelColor="#4ade80"     valColor="#86efac"  label={"🏆 " + tr("Quality Check","गुणवत्ता जांच",lang)}>{step.qualityCheck}</InfoCard>}
        {(has(step.responsible) || has(step.reviewer)) && (
          <div style={{ display:"grid", gridTemplateColumns: has(step.reviewer) ? "1fr 1fr" : "1fr", gap:10, marginBottom:10 }}>
            {has(step.responsible) && <InfoCard label={"👤 " + tr("Responsible","जिम्मेदार",lang)}>{step.responsible}</InfoCard>}
            {has(step.reviewer)    && <InfoCard label={"✅ " + tr("Reviewer","समीक्षक",lang)}>{step.reviewer}</InfoCard>}
          </div>
        )}
        {has(step.tat) && (
          <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"#1a1500", border:"1px solid " + B.orange, borderRadius:12, padding:"10px 16px", marginBottom:10 }}>
            <span style={{ fontSize:20 }}>⏱</span>
            <div>
              <div style={{ color:B.orange, fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:1, marginBottom:2 }}>TAT</div>
              <div style={{ color:"#fcd34d", fontSize:16, fontWeight:700 }}>{step.tat}</div>
            </div>
          </div>
        )}
        {has(step.escalation) && <InfoCard bg="#2d0808" border={B.redOrange} labelColor={B.redOrange} valColor="#fca5a5" label={"🚨 " + tr("If Something Goes Wrong","अगर कुछ गलत हो",lang)}>{step.escalation}</InfoCard>}
        <div style={{ height:16 }} />
      </div>

      <div style={{ padding:"12px 14px 28px", background:B.darkBg, borderTop:"1px solid " + B.cardBorder, flexShrink:0 }}>
        <OrangeBtn onClick={onNext}>
          {isLast ? "🎉 " + tr("Complete Process","प्रक्रिया पूर्ण करें",lang) : "✅ " + tr("Done — Next Step →","हो गया — अगला चरण →",lang)}
        </OrangeBtn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPERVISOR PANEL
// ─────────────────────────────────────────────────────────────────────────────
function SupervisorPanel(props) {
  var departments  = props.departments;
  var setDepartments = props.setDepartments;
  var fetchedData  = props.fetchedData;
  var loading      = props.loading;
  var log          = props.log;
  var onBack       = props.onBack;
  var onRefresh    = props.onRefresh;

  var [tab, setTab]                 = useState("overview");
  var [showLog, setShowLog]         = useState(false);
  var [editingDept, setEditingDept] = useState(null);
  var [formName, setFormName]       = useState("");
  var [formSheetId, setFormSheetId] = useState("");
  var [formEmoji, setFormEmoji]     = useState("🏢");
  var [formMsg, setFormMsg]         = useState("");

  function openEditForm(dept) {
    setEditingDept(dept);
    setFormName(dept.name);
    setFormSheetId(dept.sheetId);
    setFormEmoji(dept.emoji);
    setFormMsg("");
  }

  function clearForm() {
    setEditingDept(null);
    setFormName("");
    setFormSheetId("");
    setFormEmoji("🏢");
    setFormMsg("");
  }

  function saveForm() {
    if (!formName.trim())    { setFormMsg("Please enter a department name."); return; }
    if (!formSheetId.trim()) { setFormMsg("Please enter a Google Sheet ID or URL."); return; }
    var sheetId = extractSheetId(formSheetId);
    if (!sheetId) { setFormMsg("Could not read Sheet ID from the URL."); return; }
    if (editingDept) {
      setDepartments(function(ds) {
        var updated = ds.map(function(d) {
          return d.id === editingDept.id ? { id:d.id, name:formName.trim(), emoji:formEmoji, sheetId:sheetId } : d;
        });
        saveDepts(updated);
        return updated;
      });
      setFormMsg("Updated successfully!");
    } else {
      var newDept = { id:makeId(), name:formName.trim(), emoji:formEmoji, sheetId:sheetId };
      setDepartments(function(ds) {
        var updated = ds.concat([newDept]);
        saveDepts(updated);
        return updated;
      });
      setFormMsg("Department added!");
    }
    setTimeout(function(){ clearForm(); }, 1500);
  }

  function deleteDept(id) {
    if (!window.confirm("Remove this department?")) return;
    setDepartments(function(ds) {
      var updated = ds.filter(function(d){ return d.id !== id; });
      saveDepts(updated);
      return updated;
    });
  }

  var tabList = [["overview","📊 Overview"],["manage","➕ Depts"],["columns","📋 Columns"],["qr","📱 QR Codes"]];

  return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", paddingBottom:40 }}>
      {showLog && <DebugOverlay log={log} onClose={function(){ setShowLog(false); }} />}

      <div style={{ background:"linear-gradient(135deg," + B.primaryBlue + "," + B.tealBlue + ")", padding:"40px 16px 0", position:"relative" }}>
        <button onClick={onBack} style={{ position:"absolute", top:14, left:14, background:"rgba(255,255,255,0.15)", border:"none", color:B.white, fontSize:20, fontWeight:900, borderRadius:10, width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>←</button>
        <button onClick={function(){ setShowLog(true); }} style={{ position:"absolute", top:14, right:14, background:B.redOrange, border:"none", color:B.white, fontSize:11, fontWeight:800, borderRadius:10, padding:"6px 12px", cursor:"pointer" }}>🔍 Debug</button>
        <Logo />
        <h1 style={{ color:B.white, fontSize:22, fontWeight:900, marginTop:10 }}>Supervisor Panel</h1>
        <p style={{ color:B.lightGray, fontSize:13, opacity:0.8, marginBottom:14 }}>SOP Library Management</p>
        <div style={{ display:"flex", gap:4, overflowX:"auto" }}>
          {tabList.map(function(item){
            return (
              <button key={item[0]} onClick={function(){ setTab(item[0]); }}
                style={{ flexShrink:0, padding:"9px 12px", borderRadius:"10px 10px 0 0", fontWeight:700, fontSize:11, border:"none", cursor:"pointer", background: tab === item[0] ? "#f1f5f9" : "transparent", color: tab === item[0] ? B.primaryBlue : B.lightGray, whiteSpace:"nowrap" }}>
                {item[1]}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding:"18px 14px" }}>

        {tab === "overview" && (
          <div>
            <button onClick={onRefresh} disabled={loading}
              style={{ width:"100%", padding:"14px 0", borderRadius:14, background:"linear-gradient(135deg," + B.primaryBlue + "," + B.tealBlue + ")", color:B.white, fontWeight:800, fontSize:15, border:"none", marginBottom:16, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "⏳ Fetching from Google Sheets…" : "🔄 Refresh SOPs from Google Sheets"}
            </button>
            {departments.map(function(dept) {
              var d = fetchedData[dept.id];
              var procCount = d ? d.processes.length : 0;
              var stepCount = d ? d.processes.reduce(function(a,p){ return a + p.steps.length; }, 0) : 0;
              return (
                <div key={dept.id} style={{ background:B.white, borderRadius:16, padding:16, marginBottom:12, border:"1px solid #e2e8f0" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                    <span style={{ fontSize:28 }}>{dept.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:900, fontSize:17, color:B.primaryBlue }}>{dept.name}</div>
                      <div style={{ color:"#64748b", fontSize:12 }}>{d ? procCount + " processes · " + stepCount + " steps" : "Not loaded yet"}</div>
                    </div>
                    <div style={{ background: d ? "#dcfce7" : "#fee2e2", color: d ? "#16a34a" : "#dc2626", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700, flexShrink:0 }}>
                      {d ? "✓ Live" : "✗ Sample"}
                    </div>
                  </div>
                  {d && d.processes.map(function(p){
                    return (
                      <div key={p.name} style={{ background:"#f8fafc", borderRadius:10, padding:"7px 12px", marginBottom:5, display:"flex", justifyContent:"space-between" }}>
                        <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>{p.name}</span>
                        <span style={{ fontSize:12, color:"#94a3b8" }}>{p.steps.length} steps</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {tab === "manage" && (
          <div>
            <div style={{ background:B.white, borderRadius:16, padding:16, marginBottom:16, border:"1px solid #e2e8f0" }}>
              <h3 style={{ fontWeight:900, color:B.primaryBlue, marginBottom:12, fontSize:16 }}>
                {editingDept ? "✏️ Edit — " + editingDept.name : "➕ Add New Department"}
              </h3>
              <label style={{ color:"#374151", fontSize:13, fontWeight:700, display:"block", marginBottom:6 }}>Choose Icon</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                {DEPT_EMOJIS.map(function(e){
                  return (
                    <button key={e} onClick={function(){ setFormEmoji(e); }}
                      style={{ width:40, height:40, borderRadius:10, fontSize:20, border:"2px solid " + (formEmoji === e ? B.orange : "#e2e8f0"), background: formEmoji === e ? "#fff7ed" : "#f8fafc", cursor:"pointer" }}>
                      {e}
                    </button>
                  );
                })}
              </div>
              <label style={{ color:"#374151", fontSize:13, fontWeight:700, display:"block", marginBottom:4 }}>Department Name *</label>
              <input value={formName} onChange={function(e){ setFormName(e.target.value); }}
                placeholder="e.g. Accounts, HR, Data"
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"2px solid #e2e8f0", fontSize:15, outline:"none", marginBottom:12, boxSizing:"border-box" }} />
              <label style={{ color:"#374151", fontSize:13, fontWeight:700, display:"block", marginBottom:4 }}>Google Sheet ID or Full URL *</label>
              <input value={formSheetId} onChange={function(e){ setFormSheetId(e.target.value); }}
                placeholder="Paste full URL or just the Sheet ID"
                style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"2px solid #e2e8f0", fontSize:13, fontFamily:"monospace", outline:"none", marginBottom:6, boxSizing:"border-box" }} />
              <p style={{ color:"#94a3b8", fontSize:11, marginBottom:14 }}>Sheet must be set to Anyone with the link — Viewer</p>
              {formMsg !== "" && (
                <p style={{ color: formMsg.indexOf("success") !== -1 || formMsg.indexOf("added") !== -1 || formMsg.indexOf("Updated") !== -1 ? "#16a34a" : "#dc2626", fontWeight:700, marginBottom:10, fontSize:14 }}>{formMsg}</p>
              )}
              <div style={{ display:"flex", gap:10 }}>
                <OrangeBtn small={true} onClick={saveForm}>{editingDept ? "💾 Update" : "➕ Add Department"}</OrangeBtn>
                {editingDept && (
                  <button onClick={clearForm} style={{ flex:1, padding:"13px 0", borderRadius:14, background:"#f1f5f9", color:"#64748b", fontWeight:700, border:"none", cursor:"pointer", fontSize:14 }}>Cancel</button>
                )}
              </div>
            </div>
            <h3 style={{ fontWeight:800, color:"#374151", marginBottom:10, fontSize:15 }}>Current Departments ({departments.length})</h3>
            {departments.map(function(dept){
              return (
                <div key={dept.id} style={{ background:B.white, borderRadius:14, padding:"14px 16px", marginBottom:10, border:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:26 }}>{dept.emoji}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:800, fontSize:15, color:B.primaryBlue }}>{dept.name}</div>
                    <div style={{ color:"#94a3b8", fontSize:11, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{dept.sheetId}</div>
                  </div>
                  <button onClick={function(){ openEditForm(dept); }} style={{ background:"#eff6ff", border:"none", color:B.primaryBlue, borderRadius:8, padding:"6px 12px", fontWeight:700, fontSize:12, cursor:"pointer" }}>✏️</button>
                  <button onClick={function(){ deleteDept(dept.id); }} style={{ background:"#fee2e2", border:"none", color:"#dc2626", borderRadius:8, padding:"6px 12px", fontWeight:700, fontSize:12, cursor:"pointer" }}>🗑</button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "columns" && (
          <div style={{ background:B.white, borderRadius:16, padding:16, border:"1px solid #e2e8f0" }}>
            <h3 style={{ fontWeight:900, color:B.primaryBlue, marginBottom:4 }}>Required Google Sheet Column Headers</h3>
            <p style={{ color:"#64748b", fontSize:13, marginBottom:14 }}>Row 1 of every sheet tab must have these exact headers:</p>
            {[
              ["STAGE","Group name e.g. Site Assessment"],
              ["STEP","Step number 1 2 3"],
              ["STEP NAME","Name of this step — REQUIRED"],
              ["INPUT","What is needed to start"],
              ["PROCESS","What action to perform"],
              ["OUTPUT","What is produced after"],
              ["RESPONSIBLE","Who does this step"],
              ["REVIEWER/APPROVER","Who reviews or approves"],
              ["TAT","Time allowed e.g. 1 Day"],
              ["ESCALATION","What to do if something goes wrong"],
              ["NEXT STEP TRIGGER","What triggers the next step"],
              ["TOOLS","Equipment or software needed"],
              ["SAFETY","Safety warnings"],
              ["REFERENCE DOC","File name or document link"],
              ["DO'S","What worker must always do"],
              ["DON'TS","What worker must never do"],
              ["COMMON MISTAKES","Frequent errors to avoid"],
              ["WHAT IF","Scenario guidance if things go wrong"],
              ["QUALITY CHECK","What good output looks like vs bad"],
            ].map(function(item){
              return (
                <div key={item[0]} style={{ padding:"8px 0", borderBottom:"1px solid #f1f5f9", display:"flex", gap:10, alignItems:"flex-start" }}>
                  <code style={{ background:"#eff6ff", color:B.primaryBlue, padding:"2px 8px", borderRadius:6, fontSize:11, fontWeight:700, flexShrink:0 }}>{item[0]}</code>
                  <span style={{ color:"#64748b", fontSize:13 }}>{item[1]}</span>
                </div>
              );
            })}
          </div>
        )}

        {tab === "qr" && (
          <div>
            <p style={{ color:"#64748b", fontSize:14, marginBottom:16 }}>Print and stick on department walls.</p>
            {departments.map(function(dept){
              return (
                <div key={dept.id} style={{ background:B.white, borderRadius:20, padding:20, marginBottom:16, border:"1px solid #e2e8f0", textAlign:"center" }}>
                  <Logo center={true} />
                  <div style={{ fontSize:36, margin:"12px 0 4px" }}>{dept.emoji}</div>
                  <h3 style={{ fontWeight:900, fontSize:20, color:B.primaryBlue, marginBottom:2 }}>{dept.name} Department</h3>
                  <p style={{ color:"#94a3b8", fontSize:13, marginBottom:14 }}>Scan to view SOPs</p>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}>
                    <img src={"https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" + encodeURIComponent("3 Star Projects SOP Library — " + dept.name)} width={160} height={160} style={{ borderRadius:12 }} alt={"QR for " + dept.name} />
                  </div>
                  <p style={{ color:"#cbd5e1", fontSize:11 }}>3 STAR PROJECTS · Building Excellence</p>
                </div>
              );
            })}
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
  var [lang, setLang]               = useState("en");
  var [screen, setScreen]           = useState("home");
  var [departments, setDepartments] = useState(loadDepts);
  var [fetchedData, setFetchedData] = useState({});
  var [loading, setLoading]         = useState(false);
  var [log, setLog]                 = useState([]);
  var [selectedDeptId, setSelectedDeptId] = useState(null);
  var [selectedProc, setSelectedProc]     = useState(null);
  var [stepIdx, setStepIdx]               = useState(0);
  var [pin, setPin]                 = useState("");
  var [pinErr, setPinErr]           = useState(false);

  var addLog = useCallback(function(msg) {
    setLog(function(l){ return l.concat([msg]); });
  }, []);

  var loadFromSheets = useCallback(function() {
    setLoading(true);
    setLog([]);
    var depts = departments;
    var results = {};
    var remaining = depts.length;

    if (remaining === 0) {
      setLoading(false);
      return;
    }

    function checkDone() {
      remaining--;
      if (remaining === 0) {
        setFetchedData(Object.assign({}, results));
        setLoading(false);
        addLog("── All done ──");
      }
    }

    depts.forEach(function(dept) {
      var sheetId = extractSheetId(dept.sheetId);
      addLog("── " + dept.name + " ──");

      if (!sheetId) {
        addLog("  FAILED: No Sheet ID configured");
        results[dept.id] = { processes: SAMPLE_PROCESSES };
        checkDone();
        return;
      }

      fetchTabNames(sheetId).then(function(tabs) {
        // Deduplicate tab names
        var uniqueTabs = [];
        var seenTabs = {};
        tabs.forEach(function(t) {
          if (!seenTabs[t]) { seenTabs[t] = true; uniqueTabs.push(t); }
        });

        addLog("  tabs: [" + uniqueTabs.join(", ") + "]");

        if (uniqueTabs.length === 0) {
          addLog("  No tabs found — using sample");
          results[dept.id] = { processes: SAMPLE_PROCESSES };
          checkDone();
          return;
        }

        var tabResults = [];
        var tabsRemaining = uniqueTabs.length;

        function checkTabsDone() {
          tabsRemaining--;
          if (tabsRemaining === 0) {
            results[dept.id] = { processes: tabResults.length > 0 ? tabResults : SAMPLE_PROCESSES };
            addLog("  ✓ " + dept.name + ": " + tabResults.length + " processes loaded");
            checkDone();
          }
        }

        uniqueTabs.forEach(function(tab) {
          fetchTabSteps(sheetId, tab).then(function(steps) {
            addLog("  \"" + tab + "\" → " + steps.length + " steps");
            if (steps.length > 0) tabResults.push({ name: tab, steps: steps });
            checkTabsDone();
          }).catch(function(e) {
            addLog("  \"" + tab + "\" error: " + e.message);
            checkTabsDone();
          });
        });

      }).catch(function(e) {
        addLog("  FAILED: " + e.message);
        results[dept.id] = { processes: SAMPLE_PROCESSES };
        checkDone();
      });
    });
  }, [departments, addLog]);

  useEffect(function() {
    loadFromSheets();
  }, []);

  var selectedDept = departments.find(function(d){ return d.id === selectedDeptId; });
  var deptData     = selectedDeptId ? fetchedData[selectedDeptId] : null;
  var procObj      = deptData && deptData.processes ? deptData.processes.find(function(p){ return p.name === selectedProc; }) : null;
  var steps        = procObj ? procObj.steps : [];
  var step         = steps[stepIdx];

  function goToDept(deptId) {
    setSelectedDeptId(deptId);
    var d = fetchedData[deptId];
    var procs = d ? d.processes : [];
    if (procs.length === 1) {
      setSelectedProc(procs[0].name);
      setStepIdx(0);
      setScreen("steps");
    } else {
      setScreen("procs");
    }
  }

  // ── SCREENS ──

  if (screen === "pin") {
    return (
      <PinScreen
        lang={lang} pin={pin} setPin={setPin} err={pinErr} setErr={setPinErr}
        onBack={function(){ setScreen("home"); setPin(""); setPinErr(false); }}
        onSuccess={function(){ setScreen("supervisor"); }}
      />
    );
  }

  if (screen === "supervisor") {
    return (
      <SupervisorPanel
        departments={departments}
        setDepartments={setDepartments}
        fetchedData={fetchedData}
        loading={loading}
        log={log}
        onBack={function(){ setScreen("home"); }}
        onRefresh={loadFromSheets}
      />
    );
  }

  if (screen === "step" && step) {
    return (
      <StepView
        step={step} stepNum={stepIdx+1} total={steps.length}
        procName={selectedProc} lang={lang} setLang={setLang}
        onBack={function(){ setScreen("steps"); }}
        onNext={function(){
          if (stepIdx < steps.length - 1) setStepIdx(function(i){ return i+1; });
          else setScreen("done");
        }}
      />
    );
  }

  if (screen === "done") {
    return (
      <div style={{ minHeight:"100vh", background:B.darkBg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32 }}>
        <Logo center={true} />
        <div style={{ fontSize:72, margin:"24px 0 12px" }}>🎉</div>
        <h1 style={{ color:B.orange, fontSize:28, fontWeight:900, textAlign:"center", marginBottom:6 }}>{tr("Process Complete!","प्रक्रिया पूर्ण!",lang)}</h1>
        <p style={{ color:B.lightGray, fontSize:15, textAlign:"center", marginBottom:8 }}>{selectedProc}</p>
        <p style={{ color:"#555", fontSize:14, textAlign:"center", marginBottom:36 }}>{tr("All steps done. Great work!","सभी चरण पूर्ण। शाबाश!",lang)}</p>
        <div style={{ width:"100%", maxWidth:320, display:"flex", flexDirection:"column", gap:12 }}>
          <OrangeBtn onClick={function(){ setScreen("steps"); setStepIdx(0); }}>{tr("← Back to Process","← प्रक्रिया पर वापस",lang)}</OrangeBtn>
          <OrangeBtn outline={true} onClick={function(){ setScreen("home"); }}>🏠 {tr("Home","होम",lang)}</OrangeBtn>
        </div>
      </div>
    );
  }

  if (screen === "steps") {
    var backFromSteps = deptData && deptData.processes && deptData.processes.length > 1 ? "procs" : "depts";
    return (
      <div style={{ minHeight:"100vh", background:B.darkBg }}>
        <GradHeader onBack={function(){ setScreen(backFromSteps); }} lang={lang} setLang={setLang}>
          <p style={{ color:B.lightGray, fontSize:13, opacity:0.7, marginTop:4 }}>{selectedDept ? selectedDept.name : ""}</p>
          <h1 style={{ color:B.white, fontSize:21, fontWeight:900, marginBottom:2 }}>{selectedProc}</h1>
          <p style={{ color:B.lightGray, fontSize:13, opacity:0.7 }}>{steps.length} {tr("steps","चरण",lang)}</p>
        </GradHeader>
        <div style={{ padding:"16px 14px" }}>
          {steps.map(function(s, i){
            return (
              <button key={i} onClick={function(){ setStepIdx(i); setScreen("step"); }}
                style={{ width:"100%", background:B.cardBg, border:"1px solid " + B.cardBorder, borderRadius:16, padding:16, marginBottom:10, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg," + B.orange + "," + B.redOrange + ")", color:B.white, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:18, flexShrink:0 }}>{i+1}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:B.white, fontSize:16, fontWeight:800, lineHeight:1.3 }}>{s.name}</div>
                  {has(s.stage)       && <div style={{ color:B.tealBlue, fontSize:12, marginTop:2 }}>📍 {s.stage}</div>}
                  {has(s.responsible) && <div style={{ color:"#888", fontSize:12 }}>👤 {s.responsible}</div>}
                </div>
                {has(s.tat) && <span style={{ background:"#1a1500", border:"1px solid " + B.orange, color:B.orange, borderRadius:10, padding:"4px 10px", fontSize:12, fontWeight:700, flexShrink:0 }}>⏱ {s.tat}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (screen === "procs") {
    return (
      <div style={{ minHeight:"100vh", background:B.darkBg }}>
        <GradHeader onBack={function(){ setScreen("depts"); }} lang={lang} setLang={setLang}>
          <p style={{ color:B.lightGray, fontSize:13, opacity:0.7, marginTop:4 }}>{selectedDept ? selectedDept.name : ""}</p>
          <h1 style={{ color:B.white, fontSize:22, fontWeight:900 }}>{tr("Select Process","प्रक्रिया चुनें",lang)}</h1>
        </GradHeader>
        <div style={{ padding:"16px 14px" }}>
          {(deptData ? deptData.processes : []).map(function(proc, i){
            return (
              <button key={proc.name} onClick={function(){ setSelectedProc(proc.name); setStepIdx(0); setScreen("steps"); }}
                style={{ width:"100%", background:B.cardBg, border:"1px solid " + B.cardBorder, borderRadius:20, padding:18, marginBottom:12, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:"linear-gradient(135deg," + B.orange + "," + B.redOrange + ")", color:B.white, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:18, flexShrink:0 }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ color:B.white, fontSize:17, fontWeight:800 }}>{proc.name}</div>
                  <div style={{ color:"#888", fontSize:13, marginTop:2 }}>{proc.steps.length} {tr("steps","चरण",lang)}</div>
                </div>
                <span style={{ color:B.tealBlue, fontSize:22 }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (screen === "depts") {
    return (
      <div style={{ minHeight:"100vh", background:B.darkBg }}>
        <GradHeader onBack={function(){ setScreen("home"); }} lang={lang} setLang={setLang}>
          <h1 style={{ color:B.white, fontSize:24, fontWeight:900, marginTop:4 }}>{tr("Select Department","विभाग चुनें",lang)}</h1>
          <p style={{ color:B.lightGray, fontSize:14, opacity:0.8 }}>{tr("Which area do you work in?","आप किस क्षेत्र में काम करते हैं?",lang)}</p>
        </GradHeader>
        <div style={{ padding:"16px 14px" }}>
          {departments.map(function(dept){
            var d = fetchedData[dept.id];
            return (
              <button key={dept.id} onClick={function(){ goToDept(dept.id); }}
                style={{ width:"100%", background:B.cardBg, border:"1px solid " + B.cardBorder, borderRadius:20, padding:18, marginBottom:12, textAlign:"left", cursor:"pointer", display:"flex", alignItems:"center", gap:16 }}>
                <span style={{ fontSize:32 }}>{dept.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ color:B.orange, fontSize:19, fontWeight:900 }}>{dept.name}</div>
                  <div style={{ color:"#888", fontSize:13, marginTop:2 }}>
                    {d ? d.processes.length + " " + tr("processes","प्रक्रियाएं",lang) : tr("Loading…","लोड हो रहा है…",lang)}
                  </div>
                </div>
                <span style={{ color:B.tealBlue, fontSize:22 }}>›</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── HOME ──
  return (
    <div style={{ minHeight:"100vh", background:B.darkBg, display:"flex", flexDirection:"column" }}>
      <div style={{ background:"linear-gradient(135deg," + B.primaryBlue + "," + B.tealBlue + ")", padding:"52px 24px 36px", display:"flex", flexDirection:"column", alignItems:"center", position:"relative" }}>
        <button onClick={function(){ setLang(function(l){ return l === "en" ? "hi" : "en"; }); }}
          style={{ position:"absolute", top:16, right:16, background:B.orange, color:B.white, border:"none", borderRadius:10, padding:"7px 16px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
          {lang === "en" ? "हिंदी" : "English"}
        </button>
        {loading && <div style={{ position:"absolute", top:20, left:16, color:B.lightGray, fontSize:12, opacity:0.8 }}>⏳ Loading SOPs…</div>}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ color:B.orange, fontSize:52, fontWeight:900, letterSpacing:-2, lineHeight:1 }}>3</span>
          <div style={{ display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", gap:3 }}>
              <span style={{ color:B.orange, fontSize:22 }}>★</span>
              <span style={{ color:B.orange, fontSize:22 }}>★</span>
              <span style={{ color:B.orange, fontSize:22 }}>★</span>
            </div>
            <span style={{ color:B.white, fontSize:26, fontWeight:900, letterSpacing:2, lineHeight:1 }}>PROJECTS</span>
          </div>
        </div>
        <div style={{ color:B.lightGray, fontSize:12, fontWeight:600, letterSpacing:4, opacity:0.8, textTransform:"uppercase" }}>Building Excellence</div>
        <div style={{ width:48, height:3, background:B.orange, borderRadius:2, margin:"18px 0 14px" }} />
        <div style={{ background:"rgba(255,255,255,0.1)", borderRadius:12, padding:"7px 18px" }}>
          <span style={{ color:B.white, fontSize:14, fontWeight:700 }}>📋 {tr("SOP Library","SOP लाइब्रेरी",lang)}</span>
        </div>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"32px 24px", gap:16 }}>
        <OrangeBtn onClick={function(){ setScreen("depts"); }}>👷 {tr("Worker — View SOPs","कर्मचारी — SOP देखें",lang)}</OrangeBtn>
        <OrangeBtn outline={true} onClick={function(){ setScreen("pin"); }}>🔧 {tr("Supervisor Panel","सुपरवाइजर पैनल",lang)}</OrangeBtn>
      </div>
      <div style={{ textAlign:"center", padding:"0 0 24px", color:"#333", fontSize:11 }}>
        3 STAR PROJECTS · {tr("Building Excellence","बिल्डिंग एक्सीलेंस",lang)}
      </div>
    </div>
  );
}
