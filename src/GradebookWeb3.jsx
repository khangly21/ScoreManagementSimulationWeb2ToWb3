import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Zap, Globe, Lock, Database, Link, CheckCircle, Clock, AlertCircle, Copy, Check, ChevronRight, Eye, Code, Activity, ArrowRight, Layers, RefreshCw, Wifi, WifiOff, Hash, BookOpen, Star, Cpu, Server, CloudOff, Cloud, ExternalLink } from "lucide-react";

/* ─── inject Bootstrap ─────────────────────────────── */
const useBootstrap = () => {
  useEffect(() => {
    if (!document.getElementById("bs-cdn")) {
      const l = document.createElement("link");
      l.id = "bs-cdn"; l.rel = "stylesheet";
      l.href = "https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.3/css/bootstrap.min.css";
      document.head.prepend(l);
    }
  }, []);
};

/* ─── Deterministic fake data ──────────────────────── */
const mkHash = (seed) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return "0x" + h.toString(16).padStart(8,"0") + Math.abs(h * 31 + seed.length).toString(16).padStart(56,"0");
};
const mkAddr = (name) => "0x" + mkHash(name).slice(2,42);
const mkBlock = (idx) => 19_847_200 + idx * 13;

const INITIAL_STUDENTS = [
  { id:1, name:"Nguyễn Minh Khoa",  score:9.5, status:"done" },
  { id:2, name:"Trần Thị Lan",      score:8.0, status:"done" },
  { id:3, name:"Lê Văn Hùng",       score:7.5, status:"late" },
  { id:4, name:"Phạm Thị Mai",      score:6.0, status:"done" },
  { id:5, name:"Hoàng Đức Anh",     score:"",  status:"miss" },
  { id:6, name:"Vũ Thị Hoa",        score:8.5, status:"done" },
  { id:7, name:"Đặng Quốc Bảo",     score:5.5, status:"late" },
  { id:8, name:"Bùi Thị Thu",       score:10,  status:"done" },
];

//Solidity 0.8.24 hiện là phiên bản ổn định và an toàn nhất trong dòng 0.8.x, vì nó đã khắc phục nhiều lỗ hổng phổ biến (như overflow/underflow), bổ sung tính năng bảo mật EVM mới, và được cộng đồng khuyến nghị dùng cho triển khai smart contract thực tế.
//Arithmetic an toàn mặc định: từ 0.8.0 trở đi, mọi phép toán số học sẽ tự động revert nếu xảy ra overflow/underflow. Điều này loại bỏ một lớp lỗi nghiêm trọng từng gây nhiều vụ hack.
const SOLIDITY = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GradeLedger — Immutable Score Registry
/// @notice Stores student grades on-chain forever
contract GradeLedger {

    struct ScoreRecord {
        bytes32  studentHash;   // keccak256(studentName)
        uint8    score;         // 0–100 (×10 for decimals)
        uint64   timestamp;
        address  instructor;
        bool     exists;
    }

    // courseId => studentHash => record
    mapping(uint256 => mapping(bytes32 => ScoreRecord)) 
        public records;

    event ScorePublished(
        uint256 indexed courseId,
        bytes32 indexed studentHash,
        uint8   score,
        address instructor
    );

    function publishScore(
        uint256 courseId,
        string  calldata studentName,
        uint8   score          // pass 95 for 9.5
    ) external {
        bytes32 sHash = keccak256(bytes(studentName));
        records[courseId][sHash] = ScoreRecord({
            studentHash: sHash,
            score:       score,
            timestamp:   uint64(block.timestamp),
            instructor:  msg.sender,
            exists:      true
        });
        emit ScorePublished(courseId, sHash, score, msg.sender);
    }

    function getScore(
        uint256 courseId,
        string calldata studentName
    ) external view returns (uint8, uint64, address) {
        bytes32 sHash = keccak256(bytes(studentName));
        ScoreRecord memory r = records[courseId][sHash];
        require(r.exists, "Score not found");
        return (r.score, r.timestamp, r.instructor);
    }
}`;

/* ─── Colour helpers ───────────────────────────────── */
const scoreColor = (s) => {
  if (s === "" || s === null) return "#6b7280";
  const n = parseFloat(s);
  return n >= 8.5 ? "#4ade80" : n >= 7 ? "#60a5fa" : n >= 5 ? "#fbbf24" : "#f87171";
};
const statusStyle = (st) => ({
  done: { bg:"rgba(74,222,128,.12)", color:"#4ade80", border:"rgba(74,222,128,.3)", label:"✅ Đã nộp" },
  late: { bg:"rgba(251,191,36,.1)",  color:"#fbbf24", border:"rgba(251,191,36,.25)",label:"⏰ Nộp trễ" },
  miss: { bg:"rgba(248,113,113,.1)", color:"#f87171", border:"rgba(248,113,113,.25)",label:"❌ Chưa nộp" },
}[st] || {});
const fmt = (iso) => { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) + " " + d.toLocaleDateString("vi-VN"); };
const shortHash = h => h ? h.slice(0,10)+"…"+h.slice(-6) : "";

/* ═══════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                      */
/* ═══════════════════════════════════════════════════ */
export default function GradebookWeb3() {
  useBootstrap();

  /* ── state ── */
  const [students, setStudents] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gb3_stu")) || INITIAL_STUDENTS; } catch { return INITIAL_STUDENTS; }
  });
  const [chainRecords, setChainRecords] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gb3_chain")) || {}; } catch { return {}; }
  }); // { studentId: { txHash, blockNum, timestamp, gas } }
  const [pendingId, setPendingId]   = useState(null);   // publishing animation
  const [activeTab, setActiveTab]   = useState("board"); // board | contract | concepts | diff
  const [wallet, setWallet]         = useState(null);    // null | connecting | { address, network }
  const [walletError, setWalletError] = useState("");
  const [copied, setCopied]         = useState("");
  const [txLog, setTxLog]           = useState([]);
  const [editId, setEditId]         = useState(null);
  const [editScore, setEditScore]   = useState("");
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchPending, setBatchPending] = useState(false);
  const [highlightDiff, setHighlightDiff] = useState(null); // "web2"|"web3"
  const [codeHighlight, setCodeHighlight] = useState(null);
  const nextId = useRef(20);

  /* ── persist ── */
  useEffect(() => { try { localStorage.setItem("gb3_stu", JSON.stringify(students)); } catch {} }, [students]);
  useEffect(() => { try { localStorage.setItem("gb3_chain", JSON.stringify(chainRecords)); } catch {} }, [chainRecords]);

  /* ── MetaMask connect ── */
  const connectWallet = async () => {
    setWallet("connecting"); setWalletError("");
    try {
      if (window.ethereum) {
        const accounts = await window.ethereum.request({ method:"eth_requestAccounts" });
        const chainId  = await window.ethereum.request({ method:"eth_chainId" });
        const netNames = { "0x1":"Ethereum Mainnet","0xaa36a7":"Sepolia Testnet","0x89":"Polygon","0x13881":"Mumbai Testnet","0x7a69":"Localhost" };
        setWallet({ address: accounts[0], network: netNames[chainId] || `Chain ${parseInt(chainId,16)}`, chainId });
      } else {
        // Simulate wallet for demo
        setWallet({ address: mkAddr("demo-instructor"), network:"Sepolia Testnet (Demo)", chainId:"0xaa36a7", demo:true });
      }
    } catch (e) {
      setWalletError(e.message || "Connection refused");
      setWallet(null);
    }
  };

  /* ── publish single score to chain ── */
  const publishToChain = useCallback(async (student) => {
    if (!wallet || wallet === "connecting") return;
    if (student.score === "" || student.score === null) return;
    setPendingId(student.id);
    await new Promise(r => setTimeout(r, 2800)); // dramatic pause
    const txHash   = mkHash(student.name + student.score + Date.now());
    const blockNum = mkBlock(txLog.length);
    const gasUsed  = (21000 + Math.floor(Math.random()*30000)).toLocaleString();
    const record   = { txHash, blockNum, timestamp: new Date().toISOString(), gas: gasUsed, score: student.score };
    setChainRecords(prev => ({ ...prev, [student.id]: record }));
    setTxLog(prev => [{ id: student.id, name: student.name, score: student.score, txHash, blockNum, timestamp: record.timestamp, gas: gasUsed }, ...prev.slice(0,19)]);
    setPendingId(null);
  }, [wallet, txLog]);

  /* ── batch publish ── */
  const batchPublish = async () => {
    const unpublished = students.filter(s => s.score !== "" && !chainRecords[s.id]);
    setBatchPending(true); setConfirmBatch(false);
    for (const s of unpublished) {
      setPendingId(s.id);
      await new Promise(r => setTimeout(r, 1800));
      const txHash   = mkHash(s.name + s.score + Date.now() + Math.random());
      const blockNum = mkBlock(txLog.length + unpublished.indexOf(s));
      const gasUsed  = (21000 + Math.floor(Math.random()*30000)).toLocaleString();
      const record   = { txHash, blockNum, timestamp:new Date().toISOString(), gas:gasUsed, score:s.score };
      setChainRecords(prev => ({ ...prev, [s.id]: record }));
      setTxLog(prev => [{ id:s.id, name:s.name, score:s.score, txHash, blockNum, timestamp:record.timestamp, gas:gasUsed },...prev.slice(0,19)]);
    }
    setPendingId(null); setBatchPending(false);
  };

  const copyText = (text, key) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(()=>setCopied(""),2000); };

  const saveEdit = (id) => {
    setStudents(ss => ss.map(s => s.id===id ? { ...s, score: editScore } : s));
    // Invalidate chain record if score changed
    const old = students.find(s=>s.id===id);
    if (old && parseFloat(old.score) !== parseFloat(editScore)) setChainRecords(prev => { const n={...prev}; delete n[id]; return n; });
    setEditId(null);
  };

  const publishedCount = students.filter(s => chainRecords[s.id]).length;
  const scoredCount    = students.filter(s => s.score !== "" && s.score !== null).length;
  const unpublishedCount = scoredCount - publishedCount;

  /* ═══════════════════════════ RENDER ═══════════════════════════ */
  const T = {
    bg:       "#080c14",
    surface:  "#0d1220",
    card:     "#111827",
    cardHigh: "#1a2236",
    border:   "#1e2d45",
    borderHi: "#2d4a6e",
    text:     "#e2e8f0",
    muted:    "#64748b",
    accent:   "#6366f1",
    gold:     "#f59e0b",
    green:    "#10b981",
    red:      "#ef4444",
  };

  const INPUT = { background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:"7px 11px", color:T.text, fontSize:13, fontFamily:"inherit" };

  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:T.bg, minHeight:"100vh", color:T.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700;800&display=swap');
        .w3-root * { box-sizing:border-box; }
        .w3-root { font-family:'Space Grotesk',sans-serif; }
        .w3-root input,.w3-root select,.w3-root textarea { font-family:inherit; }
        .w3-root input:focus,.w3-root select:focus { outline:none; border-color:#6366f1 !important; box-shadow:0 0 0 3px rgba(99,102,241,.18); }
        .w3-root ::-webkit-scrollbar { width:4px; height:4px; }
        .w3-root ::-webkit-scrollbar-thumb { background:#1e2d45; border-radius:2px; }
        .pulse { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .slide-in { animation: slideIn .35s ease; }
        @keyframes slideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
        .glow-green { box-shadow: 0 0 16px rgba(16,185,129,.22); }
        .glow-purple { box-shadow: 0 0 20px rgba(99,102,241,.28); }
        .chain-badge { background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(99,102,241,.15)); border:1px solid rgba(99,102,241,.35); border-radius:999px; padding:2px 9px; font-size:11px; font-weight:700; color:#a5b4fc; display:inline-flex; align-items:center; gap:4px; }
        .web2-badge { background:rgba(245,158,11,.08); border:1px solid rgba(245,158,11,.25); border-radius:999px; padding:2px 9px; font-size:11px; font-weight:600; color:#fbbf24; display:inline-flex; align-items:center; gap:4px; }
        .btn-chain { background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; border-radius:9px; padding:6px 14px; color:#fff; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all .15s; }
        .btn-chain:hover { box-shadow:0 4px 18px rgba(99,102,241,.45); transform:translateY(-1px); }
        .btn-chain:disabled { opacity:.45; cursor:not-allowed; transform:none; box-shadow:none; }
        .tab-btn { padding:9px 18px; background:transparent; border:none; border-bottom:2px solid transparent; color:#64748b; cursor:pointer; font-size:13px; font-weight:600; transition:all .15s; white-space:nowrap; }
        .tab-btn.active { color:#e2e8f0; border-bottom-color:#6366f1; }
        .tab-btn:hover:not(.active) { color:#94a3b8; }
        .concept-card { background:#111827; border:1.5px solid #1e2d45; border-radius:14px; padding:20px; transition:all .2s; cursor:default; }
        .concept-card:hover { border-color:#6366f1; transform:translateY(-3px); box-shadow:0 8px 30px rgba(99,102,241,.2); }
        .diff-row { display:grid; grid-template-columns:1fr 40px 1fr; gap:0; align-items:stretch; margin-bottom:6px; }
        .diff-cell { padding:10px 14px; font-size:13px; border-radius:0; }
        .diff-cell.web2 { background:rgba(245,158,11,.07); border:1px solid rgba(245,158,11,.18); border-radius:10px 0 0 10px; color:#fbbf24; }
        .diff-cell.vs   { background:#0d1220; border-top:1px solid #1e2d45; border-bottom:1px solid #1e2d45; display:flex; align-items:center; justify-content:center; color:#4b5563; font-size:11px; font-weight:700; }
        .diff-cell.web3 { background:rgba(99,102,241,.08); border:1px solid rgba(99,102,241,.22); border-radius:0 10px 10px 0; color:#a5b4fc; }
        .highlight-web2 .diff-cell.web2 { background:rgba(245,158,11,.18) !important; border-color:#f59e0b !important; }
        .highlight-web3 .diff-cell.web3 { background:rgba(99,102,241,.22) !important; border-color:#6366f1 !important; }
        .code-line { display:block; padding:1px 0; }
        .code-line:hover { background:rgba(99,102,241,.08); border-radius:3px; }
        .tx-row { border-bottom:1px solid #1e2d45; padding:10px 0; animation:slideIn .3s ease; }
        .tx-row:last-child { border-bottom:none; }
      `}</style>

      <div className="w3-root">

        {/* ══ GRADIENT HERO BANNER ══════════════════════════ */}
        <div style={{ background:"linear-gradient(135deg,#0a0f1e 0%,#0f1a3a 40%,#1a0f3a 70%,#0a1a0f 100%)", borderBottom:`1px solid ${T.border}`, padding:"24px 0 0", position:"relative", overflow:"hidden" }}>
          {/* Decorative circles */}
          {[["#6366f1","-60px","-60px","220px"],["#10b981","auto","-40px","160px"],["#f59e0b","60%","80%","120px"]].map(([c,t,l,s],i)=>(
            <div key={i} style={{position:"absolute",top:t,left:l,width:s,height:s,borderRadius:"50%",background:c,opacity:.06,filter:"blur(30px)",pointerEvents:"none"}}/>
          ))}

          <div className="container-xl" style={{position:"relative"}}>
            {/* Title row */}
            <div className="d-flex align-items-center flex-wrap gap-3 mb-4">
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center"}}><BookOpen size={18} color="#fff"/></div>
                  <div>
                    <div style={{fontSize:11,color:T.muted,fontWeight:600,letterSpacing:".1em",textTransform:"uppercase"}}>Gradebook — Web2 → Web3</div>
                    <h1 style={{margin:0,fontSize:22,fontWeight:800,letterSpacing:"-.5px",color:T.text}}>Score Management on the <span style={{background:"linear-gradient(90deg,#6366f1,#10b981)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Blockchain</span></h1>
                  </div>
                </div>
              </div>

              {/* Wallet button */}
              <div className="ms-auto">
                {!wallet ? (
                  <button onClick={connectWallet} style={{background:"linear-gradient(135deg,#f59e0b,#ea580c)",border:"none",borderRadius:11,padding:"9px 20px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:7,boxShadow:"0 4px 20px rgba(245,158,11,.35)"}}>
                    <Globe size={16}/>Connect Wallet
                  </button>
                ) : wallet === "connecting" ? (
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 18px",background:T.cardHigh,border:`1px solid ${T.border}`,borderRadius:11}}>
                    <RefreshCw size={14} color="#6366f1" className="spin"/><span style={{fontSize:13,color:T.muted}}>Connecting…</span>
                  </div>
                ) : (
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.3)",borderRadius:11}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#10b981",boxShadow:"0 0 8px #10b981"}} className="pulse"/>
                    <div>
                      <div style={{fontSize:11,color:"#10b981",fontWeight:700,fontFamily:"monospace"}}>{wallet.address.slice(0,8)}…{wallet.address.slice(-4)}</div>
                      <div style={{fontSize:10,color:T.muted}}>{wallet.network}{wallet.demo?" (Demo)":""}</div>
                    </div>
                    {wallet.demo && <span style={{fontSize:9,padding:"1px 5px",background:"rgba(245,158,11,.15)",color:"#fbbf24",borderRadius:4,fontWeight:700}}>SIM</span>}
                  </div>
                )}
                {walletError && <div style={{fontSize:11,color:T.red,marginTop:4}}>{walletError}</div>}
              </div>
            </div>

            {/* Stats strip */}
            <div className="d-flex gap-3 flex-wrap mb-0">
              {[
                [students.length, "Students", Database, "#60a5fa"],
                [scoredCount, "Scored", CheckCircle, "#4ade80"],
                [publishedCount, "On-Chain ⛓️", Link, "#a5b4fc"],
                [unpublishedCount, "Pending Upload", Clock, "#fbbf24"],
              ].map(([v,l,Ic,c])=>(
                <div key={l} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:10,minWidth:130}}>
                  <Ic size={16} color={c}/>
                  <div>
                    <div style={{fontWeight:800,fontSize:19,color:c,fontFamily:"monospace",lineHeight:1}}>{v}</div>
                    <div style={{fontSize:11,color:T.muted}}>{l}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="d-flex gap-0 mt-4" style={{borderBottom:`1px solid ${T.border}`,overflowX:"auto"}}>
              {[["board","📋 Score Board"],["diff","⚡ Web2 vs Web3"],["contract","📜 Smart Contract"],["concepts","💡 Concepts"]].map(([k,l])=>(
                <button key={k} className={`tab-btn${activeTab===k?" active":""}`} onClick={()=>setActiveTab(k)}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ══ MAIN CONTENT ════════════════════════════════ */}
        <div className="container-xl" style={{padding:"28px 0 48px"}}>

          {/* ──────────────────────── SCORE BOARD ──────────────────────── */}
          {activeTab === "board" && (
            <div>
              {/* Transition illustration */}
              <div className="row g-3 mb-4">
                {/* Web2 side */}
                <div className="col-md-5">
                  <div style={{background:T.surface,border:"1.5px solid rgba(245,158,11,.25)",borderRadius:14,padding:18,height:"100%"}}>
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <Server size={16} color="#f59e0b"/>
                      <span style={{fontWeight:700,color:"#fbbf24",fontSize:14}}>Web2 — localStorage</span>
                      <span className="web2-badge ms-auto">Centralized</span>
                    </div>
                    <div className="d-flex flex-column gap-1" style={{fontSize:12,color:T.muted}}>
                      {[["💾","Stored in browser localStorage",true],["🔒","Only you can read it",true],["✏️","Can be edited anytime",true],["⚠️","Lost if browser data cleared",false],["👁️","No public verifiability",false]].map(([ic,txt,ok])=>(
                        <div key={txt} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0"}}>
                          <span>{ic}</span>
                          <span style={{color:ok?T.text:T.muted}}>{txt}</span>
                          {!ok && <AlertCircle size={11} color="#f59e0b" style={{marginLeft:"auto",flexShrink:0}}/>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="col-md-2 d-flex align-items-center justify-content-center">
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:24,marginBottom:4}}>⛓️</div>
                    <ArrowRight size={28} color="#6366f1"/>
                    <div style={{fontSize:11,color:T.muted,marginTop:4,whiteSpace:"nowrap"}}>Publish to</div>
                    <div style={{fontSize:11,color:"#a5b4fc",fontWeight:700}}>Blockchain</div>
                  </div>
                </div>

                {/* Web3 side */}
                <div className="col-md-5">
                  <div style={{background:T.surface,border:"1.5px solid rgba(99,102,241,.35)",borderRadius:14,padding:18,height:"100%"}} className="glow-purple">
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <Globe size={16} color="#6366f1"/>
                      <span style={{fontWeight:700,color:"#a5b4fc",fontSize:14}}>Web3 — Blockchain</span>
                      <span className="chain-badge ms-auto"><Hash size={10}/>Immutable</span>
                    </div>
                    <div className="d-flex flex-column gap-1" style={{fontSize:12,color:T.muted}}>
                      {[["🌐","Stored on Ethereum (decentralised)",true],["🔍","Publicly verifiable by anyone",true],["🔒","Cannot be altered or deleted",true],["♾️","Permanent — survives forever",true],["📜","Smart contract enforces rules",true]].map(([ic,txt,ok])=>(
                        <div key={txt} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0"}}>
                          <span>{ic}</span>
                          <span style={{color:T.text}}>{txt}</span>
                          <CheckCircle size={11} color="#10b981" style={{marginLeft:"auto",flexShrink:0}}/>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch publish bar */}
              {unpublishedCount > 0 && wallet && wallet !== "connecting" && (
                <div className="slide-in mb-4" style={{background:"rgba(99,102,241,.08)",border:"1.5px solid rgba(99,102,241,.3)",borderRadius:12,padding:"12px 18px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <Zap size={16} color="#6366f1"/>
                  <span style={{fontSize:13,color:T.text,flex:1}}><strong style={{color:"#a5b4fc"}}>{unpublishedCount} scored</strong> student{unpublishedCount>1?"s have":"'s"} not been published to the blockchain yet.</span>
                  {!confirmBatch ? (
                    <button className="btn-chain" onClick={()=>setConfirmBatch(true)} disabled={batchPending}><Link size={13}/>Batch Publish All</button>
                  ) : (
                    <div className="d-flex align-items-center gap-2">
                      <span style={{fontSize:12,color:"#fbbf24"}}>This will send {unpublishedCount} transactions. Confirm?</span>
                      <button className="btn-chain" onClick={batchPublish}><CheckCircle size={12}/>Yes, publish</button>
                      <button onClick={()=>setConfirmBatch(false)} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 10px",color:T.muted,cursor:"pointer",fontSize:12}}>Cancel</button>
                    </div>
                  )}
                </div>
              )}

              {/* Score table */}
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",marginBottom:28}}>
                {/* Header */}
                <div style={{display:"grid",gridTemplateColumns:"40px 1fr 120px 110px 130px 180px",gap:0,padding:"10px 16px",background:T.card,borderBottom:`1px solid ${T.border}`,fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:".08em"}}>
                  <div>#</div><div>Học sinh</div><div>Điểm</div><div>Trạng thái</div><div>Web3 Status</div><div style={{textAlign:"right"}}>Hành động</div>
                </div>

                {students.map((s,idx) => {
                  const cr = chainRecords[s.id];
                  const pending = pendingId === s.id;
                  const isEditing = editId === s.id;
                  const ss = statusStyle(s.status);
                  const sc = parseFloat(s.score);
                  return (
                    <div key={s.id} style={{display:"grid",gridTemplateColumns:"40px 1fr 120px 110px 130px 180px",gap:0,padding:"12px 16px",borderBottom:`1px solid ${T.border}`,background:pending?"rgba(99,102,241,.05)":cr?"rgba(16,185,129,.03)":T.surface,transition:"background .3s",alignItems:"center"}}>
                      <div style={{fontSize:12,color:T.muted,fontFamily:"monospace"}}>{idx+1}</div>

                      {/* Name */}
                      <div style={{fontSize:14,fontWeight:500,color:T.text}}>{s.name}</div>

                      {/* Score */}
                      <div>
                        {isEditing ? (
                          <div className="d-flex gap-1">
                            <input type="number" min="0" max="10" step="0.5" value={editScore} onChange={e=>setEditScore(e.target.value)} style={{...INPUT,width:60,padding:"4px 8px",fontSize:13,fontFamily:"monospace"}}/>
                            <button onClick={()=>saveEdit(s.id)} style={{background:"#10b981",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",color:"#fff",fontSize:12}}><Check size={12}/></button>
                          </div>
                        ) : (
                          <span onClick={()=>{setEditId(s.id);setEditScore(s.score);}} style={{cursor:"text",fontWeight:700,fontFamily:"monospace",fontSize:15,color:scoreColor(s.score),padding:"2px 8px",borderRadius:6,background:"rgba(0,0,0,.2)",display:"inline-block"}}>
                            {s.score !== "" ? parseFloat(s.score).toFixed(1) : "—"}
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <div><span style={{fontSize:11,padding:"3px 9px",borderRadius:999,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,fontWeight:600,whiteSpace:"nowrap"}}>{ss.label}</span></div>

                      {/* Web3 */}
                      <div>
                        {pending ? (
                          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#a5b4fc"}}>
                            <RefreshCw size={12} className="spin"/><span className="pulse">Mining…</span>
                          </div>
                        ) : cr ? (
                          <div style={{cursor:"pointer"}} onClick={()=>copyText(cr.txHash, "tx"+s.id)} title={cr.txHash}>
                            <span className="chain-badge"><CheckCircle size={10}/>Verified</span>
                            <div style={{fontSize:10,color:T.muted,fontFamily:"monospace",marginTop:2}}>{shortHash(cr.txHash)}{copied==="tx"+s.id?<span style={{color:"#10b981",marginLeft:4}}>✓</span>:null}</div>
                          </div>
                        ) : (
                          <span style={{fontSize:11,color:T.muted}}>Not on-chain</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="d-flex gap-2 justify-content-end">
                        {!cr && s.score !== "" && !pending && (
                          <button className="btn-chain" onClick={()=>publishToChain(s)} disabled={!wallet||wallet==="connecting"||!!pendingId}>
                            {!wallet ? <><WifiOff size={11}/>Connect</>:<><Link size={11}/>Publish</>}
                          </button>
                        )}
                        {cr && (
                          <a href={`https://sepolia.etherscan.io/tx/${cr.txHash}`} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#6366f1",textDecoration:"none"}} title="View on Etherscan">
                            <ExternalLink size={11}/>Explorer
                          </a>
                        )}
                        {cr && <span style={{fontSize:10,color:"#10b981",display:"flex",alignItems:"center",gap:3}}><Lock size={10}/>Immutable</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Transaction log */}
              {txLog.length > 0 && (
                <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                  <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8}}>
                    <Activity size={14} color="#6366f1"/>
                    <span style={{fontWeight:700,fontSize:13,color:T.text}}>Transaction Log</span>
                    <span style={{marginLeft:"auto",fontSize:11,color:T.muted,fontFamily:"monospace"}}>{txLog.length} txns</span>
                  </div>
                  <div style={{padding:"0 18px",maxHeight:220,overflow:"auto"}}>
                    {txLog.map((tx,i)=>(
                      <div key={i} className="tx-row d-flex align-items-center gap-3" style={{flexWrap:"wrap"}}>
                        <CheckCircle size={14} color="#10b981" style={{flexShrink:0}}/>
                        <div style={{flex:1,minWidth:120}}>
                          <div style={{fontSize:12,fontWeight:600,color:T.text}}>{tx.name}</div>
                          <div style={{fontSize:11,color:T.muted}}>Score: <span style={{color:scoreColor(tx.score),fontFamily:"monospace",fontWeight:700}}>{parseFloat(tx.score).toFixed(1)}</span></div>
                        </div>
                        <div style={{fontFamily:"monospace",fontSize:11,color:"#6366f1",cursor:"pointer"}} onClick={()=>copyText(tx.txHash,"log"+i)}>
                          {shortHash(tx.txHash)}{copied==="log"+i&&<span style={{color:"#10b981",marginLeft:4}}>✓</span>}
                        </div>
                        <div style={{fontSize:11,color:T.muted}}>Block #{tx.blockNum.toLocaleString()}</div>
                        <div style={{fontSize:11,color:T.muted}}>⛽ {tx.gas} gas</div>
                        <div style={{fontSize:11,color:T.muted}}>{fmt(tx.timestamp)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────────────────────── DIFF ──────────────────────── */}
          {activeTab === "diff" && (
            <div>
              <div style={{marginBottom:24}}>
                <h2 style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:6}}>Web2 ↔ Web3 — Key Differences</h2>
                <p style={{fontSize:13,color:T.muted}}>Hover a row to highlight. The gradebook uses <strong style={{color:"#fbbf24"}}>both layers</strong> — Web2 for fast local edits, Web3 for permanent public proof.</p>
                <div className="d-flex gap-3 mt-3">
                  <div style={{flex:1,background:"rgba(245,158,11,.08)",border:"1.5px solid rgba(245,158,11,.3)",borderRadius:10,padding:"10px 16px",textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#fbbf24",marginBottom:2}}>🏗️ Web2 Layer</div>
                    <div style={{fontSize:11,color:T.muted}}>localStorage · Fast · Mutable</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",color:T.muted}}><ArrowRight size={20}/></div>
                  <div style={{flex:1,background:"rgba(99,102,241,.08)",border:"1.5px solid rgba(99,102,241,.35)",borderRadius:10,padding:"10px 16px",textAlign:"center"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#a5b4fc",marginBottom:2}}>⛓️ Web3 Layer</div>
                    <div style={{fontSize:11,color:T.muted}}>Ethereum · Permanent · Verifiable</div>
                  </div>
                </div>
              </div>

              {/* Diff grid */}
              <div style={{marginBottom:8,display:"grid",gridTemplateColumns:"1fr 40px 1fr",gap:0}}>
                <div style={{padding:"8px 14px",fontSize:11,fontWeight:700,color:"#fbbf24",textTransform:"uppercase",letterSpacing:".08em"}}>Web2 — localStorage</div>
                <div/>
                <div style={{padding:"8px 14px",fontSize:11,fontWeight:700,color:"#a5b4fc",textTransform:"uppercase",letterSpacing:".08em"}}>Web3 — Blockchain</div>
              </div>

              {[
                ["💾 Storage","Browser localStorage (client-only)","Ethereum nodes worldwide (distributed)"],
                ["👁️ Visibility","Private to your device","Public — anyone can verify"],
                ["✏️ Mutability","Editable / deletable anytime","Immutable once written to chain"],
                ["🔐 Trust model","Trust the server / owner","Trustless — code enforces rules"],
                ["💸 Cost","Free (read/write)","Gas fee per write (~$0.01–$2 on L2)"],
                ["⚡ Speed","Instant (<1ms)","~12 seconds (block time)"],
                ["♾️ Persistence","Until cache cleared","Forever (as long as chain lives)"],
                ["📜 Auditability","No audit trail","Full on-chain history, tx hashes"],
                ["🔑 Identity","Anonymous / session-based","Wallet address = identity"],
                ["🛡️ Censorship","Can be taken down","Censorship-resistant"],
                ["🌐 Interoperability","Siloed to this app","Any app can read the contract"],
                ["🎓 Use case in class","Draft edits, quick scoring","Official grade certificate on-chain"],
              ].map(([prop, w2, w3], i) => (
                <div key={prop} className={`diff-row${highlightDiff==="web2"?" highlight-web2":highlightDiff==="web3"?" highlight-web3":""}`} onMouseEnter={()=>{}} style={{marginBottom:5}}>
                  <div className="diff-cell web2">
                    <div style={{fontSize:10,color:"#f59e0b",fontWeight:700,marginBottom:2}}>{prop}</div>
                    <div style={{fontSize:12}}>{w2}</div>
                  </div>
                  <div className="diff-cell vs">VS</div>
                  <div className="diff-cell web3">
                    <div style={{fontSize:10,color:"#818cf8",fontWeight:700,marginBottom:2}}>{prop}</div>
                    <div style={{fontSize:12}}>{w3}</div>
                  </div>
                </div>
              ))}

              {/* Flow diagram */}
              <div style={{marginTop:28,background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:22}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:16}}>📡 Data Flow in this App</div>
                <div className="d-flex align-items-center gap-2 flex-wrap" style={{fontSize:12,color:T.muted}}>
                  {[["Teacher edits score","#94a3b8"],["→","#4b5563"],["Saved to localStorage","#fbbf24"],["→","#4b5563"],["Click Publish","#6366f1"],["→","#4b5563"],["MetaMask signs tx","#f59e0b"],["→","#4b5563"],["Smart contract stores on Ethereum","#10b981"],["→","#4b5563"],["TX Hash = Proof of grade","#a5b4fc"]].map(([label,color],i)=>(
                    <span key={i} style={{color,fontWeight:label==="→"?400:600,fontSize:label==="→"?18:12,padding:label==="→"?"0 4px":"4px 10px",background:label==="→"?"transparent":"rgba(255,255,255,.04)",borderRadius:6,border:label==="→"?"none":`1px solid rgba(255,255,255,.07)`}}>{label}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────── SMART CONTRACT ──────────────────────── */}
          {activeTab === "contract" && (
            <div>
              <div className="row g-4">
                <div className="col-lg-8">
                  <div style={{background:"#0d1117",border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden"}}>
                    <div style={{background:"#161b22",padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:"#ff5f56"}}/><div style={{width:10,height:10,borderRadius:"50%",background:"#febc2e"}}/><div style={{width:10,height:10,borderRadius:"50%",background:"#28c840"}}/>
                      <span style={{marginLeft:8,fontSize:12,color:"#8b949e",fontFamily:"monospace"}}>GradeLedger.sol</span>
                      <button onClick={()=>copyText(SOLIDITY,"sol")} style={{marginLeft:"auto",background:"transparent",border:"none",cursor:"pointer",color:"#8b949e",display:"flex",alignItems:"center",gap:4,fontSize:11}}>
                        {copied==="sol"?<><Check size={12} color="#10b981"/>Copied</>:<><Copy size={12}/>Copy</>}
                      </button>
                    </div>
                    <pre style={{margin:0,padding:"18px 20px",fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,color:"#e6edf3",lineHeight:1.75,overflowX:"auto",maxHeight:500,overflow:"auto"}}>
                      {SOLIDITY.split("\n").map((line,i)=>{
                        const kw = line.match(/^(\/\/|pragma|contract|struct|mapping|event|function|require|emit|return|bool|uint|bytes|string|address|calldata|external|view|memory|indexed)/);
                        const color = line.startsWith("//") ? "#6a9955" : line.startsWith("pragma") ? "#c586c0" : line.startsWith("contract") ? "#4ec9b0" : line.match(/^\s+(function|event|struct|mapping)/) ? "#dcdcaa" : line.match(/uint|bool|bytes|string|address/) ? "#4ec9b0" : "green";
                        return <code key={i} className="code-line" style={{color,display:"flex",gap:12}}><span style={{color:"#3d4455",userSelect:"none",minWidth:24,textAlign:"right",fontSize:11}}>{i+1}</span><span>{line}</span></code>;
                      })}
                    </pre>
                  </div>
                </div>

                <div className="col-lg-4">
                  <div className="d-flex flex-column gap-3">
                    {/* Deploy info */}
                    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:12,display:"flex",alignItems:"center",gap:6}}><Cpu size={13} color="#6366f1}"/>Contract Info</div>
                      {[
                        ["Network","Sepolia Testnet"],
                        ["Address",mkAddr("GradeLedger").slice(0,18)+"…"],
                        ["Compiler","Solidity ^0.8.24"],
                        ["Verified","✅ Etherscan"],
                        ["Licence","MIT"],
                      ].map(([k,v])=>(
                        <div key={k} className="d-flex justify-content-between mb-2" style={{fontSize:12}}>
                          <span style={{color:T.muted}}>{k}</span>
                          <span style={{color:T.text,fontFamily:"monospace",textAlign:"right"}}>{v}</span>
                        </div>
                      ))}
                    </div>

                    {/* Functions */}
                    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:12}}>📞 ABI Functions</div>
                      {[
                        {fn:"publishScore(courseId, name, score)", type:"write", desc:"Stores a grade permanently on-chain"},
                        {fn:"getScore(courseId, name)", type:"read", desc:"Retrieves a verified score from the ledger"},
                      ].map(f=>(
                        <div key={f.fn} style={{background:T.card,borderRadius:8,padding:"10px 12px",marginBottom:8,border:`1px solid ${T.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <span style={{fontSize:9,padding:"1px 7px",borderRadius:999,background:f.type==="write"?"rgba(239,68,68,.15)":"rgba(16,185,129,.15)",color:f.type==="write"?"#f87171":"#4ade80",fontWeight:700}}>{f.type.toUpperCase()}</span>
                          </div>
                          <div style={{fontFamily:"monospace",fontSize:11,color:"#dcdcaa",marginBottom:3}}>{f.fn}</div>
                          <div style={{fontSize:11,color:T.muted}}>{f.desc}</div>
                        </div>
                      ))}
                    </div>

                    {/* Events */}
                    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18}}>
                      <div style={{fontSize:12,fontWeight:700,color:T.text,marginBottom:10}}>⚡ Events Emitted</div>
                      <div style={{background:T.card,borderRadius:8,padding:"10px 12px",border:`1px solid ${T.border}`}}>
                        <div style={{fontFamily:"monospace",fontSize:11,color:"#c586c0",marginBottom:3}}>ScorePublished</div>
                        <div style={{fontSize:11,color:T.muted}}>Emitted on every publishScore call. Indexed by courseId and studentHash for fast filtering.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────── CONCEPTS ──────────────────────── */}
          {activeTab === "concepts" && (
            <div>
              <div style={{marginBottom:24}}>
                <h2 style={{fontSize:20,fontWeight:800,color:T.text,marginBottom:4}}>Web3 Concepts in this App</h2>
                <p style={{fontSize:13,color:T.muted}}>How each blockchain concept applies to the gradebook use-case</p>
              </div>

              <div className="row g-3 mb-4">
                {[
                  { icon:"🔐", title:"Immutability", color:"#6366f1", desc:"Once a grade is published on-chain, nobody — not even the teacher — can alter or delete it. The score is forever.", how:"publishScore() writes to a mapping. No update or delete function exists in the contract. It's write-once by design." },
                  { icon:"🌐", title:"Decentralisation", color:"#10b981", desc:"Scores are replicated across thousands of Ethereum nodes worldwide. No single point of failure or control.", how:"The contract lives at a fixed address on Ethereum. Even if this web app disappears, grades remain accessible." },
                  { icon:"🔍", title:"Transparency", color:"#0ea5e9", desc:"Any student, parent, or employer can verify a grade independently using only the student name + course ID + contract address.", how:"getScore() is a public view function — callable by anyone with no gas cost." },
                  { icon:"🪪", title:"Wallet Identity", color:"#f59e0b", desc:"The teacher's Ethereum address is permanently recorded as msg.sender for each grade. It proves who published it.", how:"The ScorePublished event indexes the instructor address. Forgery is cryptographically impossible." },
                  { icon:"⛽", title:"Gas Fees", color:"#f87171", desc:"Writing to the blockchain costs gas — a small fee paid in ETH that compensates node operators for computation.", how:"publishScore() uses ~50,000 gas. On Polygon L2 this costs fractions of a cent." },
                  { icon:"📜", title:"Smart Contracts", color:"#a78bfa", desc:"The GradeLedger contract is the neutral, autonomous referee. It enforces the rules without needing a trusted intermediary.", how:"Solidity code deployed once, runs forever. No admin can override its logic." },
                  { icon:"🔗", title:"Transaction Hash", color:"#34d399", desc:"Every published grade gets a unique TX hash — a cryptographic proof of exactly when and what was recorded.", how:"The TX hash shown in the log links to Etherscan where anyone can verify the raw data." },
                  { icon:"🏛️", title:"Token Economy (future)", color:"#fb923c", desc:"Students who score ≥ 8.5 could receive an ERC-721 NFT certificate or ERC-20 reputation tokens automatically.", how:"The contract could mint tokens inside publishScore() when score >= 85, creating instant credential NFTs." },
                ].map(c=>(
                  <div key={c.title} className="col-md-6 col-lg-3">
                    <div className="concept-card h-100">
                      <div style={{fontSize:28,marginBottom:10}}>{c.icon}</div>
                      <div style={{fontSize:15,fontWeight:700,color:c.color,marginBottom:6}}>{c.title}</div>
                      <div style={{fontSize:12,color:T.text,lineHeight:1.6,marginBottom:10}}>{c.desc}</div>
                      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:10}}>
                        <div style={{fontSize:10,color:T.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".07em",marginBottom:4}}>In this app</div>
                        <div style={{fontSize:11,color:T.muted,lineHeight:1.6}}>{c.how}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Architecture diagram */}
              <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:14,padding:24}}>
                <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:18}}>🏗️ Full Architecture — This App</div>
                <div className="d-flex align-items-stretch gap-0 flex-wrap">
                  {[
                    { layer:"Frontend (React)", color:"#f59e0b", items:["Bootstrap UI","Score table","Wallet connect button","Publish button"] },
                    { layer:"Web2 Persistence", color:"#f59e0b", items:["localStorage","Fast read/write","No cost","Editable"] },
                    { layer:"Web3 Bridge", color:"#6366f1", items:["ethers.js / Web3.js","MetaMask provider","Sign transactions","Gas estimation"] },
                    { layer:"Blockchain", color:"#10b981", items:["Ethereum / Sepolia","GradeLedger.sol","Immutable storage","Public events"] },
                  ].map((l,i,arr)=>(
                    <div key={l.layer} style={{flex:1,minWidth:150}}>
                      <div style={{display:"flex",alignItems:"center",gap:0}}>
                        <div style={{flex:1,background:`rgba(${l.color==="#f59e0b"?"245,158,11":l.color==="#6366f1"?"99,102,241":"16,185,129"},.08)`,border:`1.5px solid ${l.color}33`,borderRadius:i===0?"10px 0 0 10px":i===arr.length-1?"0 10px 10px 0":"0",padding:"14px 14px",height:"100%"}}>
                          <div style={{fontSize:11,fontWeight:700,color:l.color,marginBottom:8,textTransform:"uppercase",letterSpacing:".07em"}}>{l.layer}</div>
                          {l.items.map(it=><div key={it} style={{fontSize:11,color:T.muted,marginBottom:3,display:"flex",alignItems:"center",gap:4}}><ChevronRight size={9} color={l.color}/>{it}</div>)}
                        </div>
                        {i < arr.length-1 && <ArrowRight size={18} color={T.muted} style={{flexShrink:0,marginLeft:2}}/>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
