import { useState } from "react";

const CATALOG = {
  "RUA-4AT3S":  { comp:"400DH",        kw:3.0,  qty:1, c35:10100, c46:8900,  oil:"SUNISO 4GD1-HT 0.9L" },
  "RUA-5AT3S":  { comp:"500DH",        kw:3.75, qty:1, c35:12500, c46:11300, oil:"SUNISO 4GD1-HT 0.9L" },
  "RUA-6AT3S":  { comp:"600DH",        kw:4.4,  qty:1, c35:15500, c46:14000, oil:"SUNISO 4GD1-HT 0.9L" },
  "RUA-8AT3S":  { comp:"750EL",        kw:5.5,  qty:1, c35:18600, c46:16700, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-9AT3S":  { comp:"900EL",        kw:6.8,  qty:1, c35:23200, c46:20900, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-10AT3S": { comp:"1000EL",       kw:7.5,  qty:1, c35:26300, c46:23700, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-13AT3S": { comp:"750EL+500DH",  kw:5.5,  qty:2, c35:31300, c46:28300, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-15AT3S": { comp:"1000EL+600DH", kw:7.5,  qty:2, c35:38800, c46:35000, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-20AT3S": { comp:"1000EL",       kw:7.5,  qty:2, c35:52700, c46:47500, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-25AT3S": { comp:"1200EL",       kw:9.0,  qty:2, c35:61000, c46:53800, oil:"SUNISO 4GD1-HT 2.5L" },
  "RUA-30AT3S": { comp:"1000EL",       kw:7.5,  qty:3, c35:78100, c46:70400, oil:"SUNISO 4GD1-HT 2.5L" },
};

const SYSTEM_PROMPT = `You are a senior HVAC design engineer and Copeland compressor selection specialist.

Your task is to calculate the correct Copeland ZR Scroll compressor replacement for HVAC package units based on cooling capacity, motor power, refrigerant, and UAE ambient conditions.

IMPORTANT RULES:
- Respond ONLY in valid JSON
- No markdown
- No explanations outside JSON
- No extra text
- All numbers must be numeric
- Use engineering calculations only
- Use UAE high ambient condition logic (46C default)
- Never guess impossible values
- Always prioritize compressor reliability and nearest upper capacity match
- If capacity is missing, estimate using motor kW and compressor quantity
- If multiple compressors exist, calculate per-compressor load correctly

ENGINEERING RULES:
1. Use 46C ambient capacity for UAE and Middle East
2. Divide total unit capacity by number of compressors
3. Convert: 1 kcal/h = 3.968 BTU/h, 1 TR = 12000 BTU/h, 1 TR = 3.517 kW cooling
4. Never select compressor below required load unless unavoidable
5. Prefer nearest larger ZR model
6. TFD suffix means 380-420V, 3 Phase, 50Hz
7. R22 systems may be replaced with R407C compatible ZR models
8. Recommend oil conversion note when refrigerant changes
9. Calculate per compressor: kcal/h, BTU/h, TR, cooling kW
10. COP range: Small ZR 2.6-2.9, Medium ZR 2.8-3.1, Large ZR 2.9-3.2

AVAILABLE COPELAND ZR MODELS (BTU/h):
ZR36=36000, ZR42=42000, ZR48=48000, ZR54=54000, ZR61=61000,
ZR72=72000, ZR81=81000, ZR94=94000, ZR108=108000, ZR125=125000,
ZR144=144000, ZR160=160000, ZR190=190000

Respond ONLY with this JSON structure, no other text:
{"input":{"unit_model":"","compressor_model":"","qty":0,"ambient":46,"refrigerant":""},"per_compressor":{"kcal_h":0,"btu_h":0,"tr":0,"kw_cooling":0},"primary_recommendation":{"model":"","capacity_btu":0,"capacity_tr":0,"cop":0,"match_percent":0,"reason":""},"alternative":{"model":"","capacity_btu":0,"capacity_tr":0,"cop":0,"match_percent":0,"reason":""},"system_total":{"total_tr":0,"total_kw":0,"total_btu":0,"compressor_qty":0,"order_quantity":""},"engineering_steps":[],"oil_note":"","refrigerant_note":"","warnings":[],"electrical_note":""}`;

export default function App() {
  const [mode,   setMode]   = useState("rua");
  const [unit,   setUnit]   = useState("RUA-25AT3S");
  const [amb,    setAmb]    = useState("46");
  const [man,    setMan]    = useState({ brand:"", model:"", comp:"", kw:"", qty:"1", c35:"", c46:"", ref:"R22" });
  const [result, setResult] = useState(null);
  const [loading,setLoad]   = useState(false);
  const [error,  setError]  = useState("");

  const sm = (k,v) => setMan(p=>({...p,[k]:v}));

  const parseJSON = (text) => {
    let s = text.replace(/```json|```/gi,"").trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if(a<0||b<0) throw new Error("No JSON found");
    s = s.slice(a,b+1);
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,"");
    return JSON.parse(s);
  };

  const buildPrompt = () => {
    if(mode==="rua"){
      const d = CATALOG[unit];
      return `Unit: ${unit}, Compressor: ${d.comp}, Motor: ${d.kw}kW each, Qty: ${d.qty}, Cap@35C: ${d.c35} kcal/h total, Cap@46C: ${d.c46} kcal/h total, Oil: ${d.oil}, Refrigerant: R22, Ambient: ${amb}C, Location: UAE Middle East`;
    }
    return `Brand: ${man.brand||"Unknown"}, Unit: ${man.model||"Unknown"}, Compressor: ${man.comp||"Unknown"}, Motor: ${man.kw}kW each, Qty: ${man.qty}, Cap@35C: ${man.c35||"unknown"} kcal/h, Cap@46C: ${man.c46||"unknown"} kcal/h, Refrigerant: ${man.ref}, Ambient: ${amb}C, Location: UAE`;
  };

  const analyze = async () => {
    if(mode==="manual"&&!man.kw){setError("Motor kW is required!");return;}
    setError(""); setLoad(true); setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1500,
          system:SYSTEM_PROMPT,
          messages:[{role:"user",content:buildPrompt()}]
        })
      });
      if(!res.ok) throw new Error("API error "+res.status);
      const data = await res.json();
      const text = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
      setResult(parseJSON(text));
    } catch(e){ setError("Error: "+e.message); }
    finally{ setLoad(false); }
  };

  const d = CATALOG[unit];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200" style={{fontFamily:"monospace"}}>

      {/* HEADER */}
      <div className="bg-slate-900 border-b-2 border-blue-700 px-4 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <div className="text-3xl bg-blue-700 rounded-xl w-12 h-12 flex items-center justify-center shrink-0">⚙️</div>
          <div>
            <h1 className="text-xl font-black tracking-widest text-blue-400 uppercase">ZR Compressor Selector</h1>
            <p className="text-xs text-slate-400 mt-1 tracking-wider">Hitachi RUA → Copeland ZR Scroll · UAE Catalog Based</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {!result ? (
          <>
            {/* MODE TOGGLE */}
            <div className="flex gap-3">
              {[["rua","📋 Hitachi RUA"],["manual","✏️ Manual Input"]].map(([m,l])=>(
                <button key={m} onClick={()=>setMode(m)}
                  className={`flex-1 py-3 rounded-xl font-bold text-xs tracking-widest uppercase transition-all ${mode===m?"bg-blue-700 text-white":"bg-slate-800 text-slate-400"}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* RUA MODE */}
            {mode==="rua" && (
              <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5 space-y-5">

                <SectionTitle title="SELECT UNIT MODEL"/>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(CATALOG).map(u=>(
                    <button key={u} onClick={()=>setUnit(u)}
                      className={`py-3 px-3 rounded-xl text-sm font-bold text-left transition-all ${unit===u?"bg-blue-700 text-white border-2 border-blue-400":"bg-slate-800 text-slate-300 border border-slate-600"}`}>
                      <div>{u}</div>
                      <div className="text-xs opacity-60 mt-0.5">{CATALOG[u].comp} × {CATALOG[u].qty} | {CATALOG[u].kw}kW</div>
                    </button>
                  ))}
                </div>

                {/* UNIT PREVIEW */}
                <div className="bg-slate-800 rounded-xl p-4 border border-blue-900">
                  <div className="text-xs text-blue-400 font-bold tracking-widest mb-3">📊 {unit} — OFFICIAL CATALOG DATA</div>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoBox label="Compressor Model"  val={d.comp}/>
                    <InfoBox label="Quantity"          val={`${d.qty} Units`}/>
                    <InfoBox label="Motor (per unit)"  val={`${d.kw} kW (${Math.round(d.kw/0.746)} HP)`}/>
                    <InfoBox label="Total Motor Power" val={`${(d.kw*d.qty).toFixed(1)} kW`}/>
                    <InfoBox label="Cooling @ 35°C"    val={`${d.c35.toLocaleString()} kcal/h`}/>
                    <InfoBox label="Cooling @ 46°C"    val={`${d.c46.toLocaleString()} kcal/h`}/>
                    <InfoBox label="Per Comp @ 46°C"   val={`${Math.round(d.c46/d.qty).toLocaleString()} kcal/h`}/>
                    <InfoBox label="Total TR @ 46°C"   val={`${(d.c46*3.968/12000).toFixed(1)} TR`}/>
                  </div>
                </div>

                <SectionTitle title="AMBIENT TEMPERATURE"/>
                <div className="flex gap-2">
                  {["35","40","46","52"].map(t=>(
                    <button key={t} onClick={()=>setAmb(t)}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${amb===t?"bg-orange-700 text-white":"bg-slate-800 text-slate-300"}`}>
                      {t}°C
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">Select 46°C for UAE / Middle East conditions</p>
              </div>
            )}

            {/* MANUAL MODE */}
            {mode==="manual" && (
              <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5 space-y-4">
                <SectionTitle title="COMPRESSOR SPECIFICATIONS"/>
                <div className="grid grid-cols-2 gap-3">
                  <FieldInput  l="Brand"             p="Hitachi, Carrier..."  v={man.brand} s={v=>sm("brand",v)}/>
                  <FieldInput  l="Unit Model"         p="RUA-25AT3S"           v={man.model} s={v=>sm("model",v)}/>
                  <FieldInput  l="Compressor Model"   p="1200EL-180D5"         v={man.comp}  s={v=>sm("comp",v)}/>
                  <FieldInput  l="Motor kW (each) *"  p="9.0"                  v={man.kw}    s={v=>sm("kw",v)} t="number"/>
                  <FieldSelect l="Quantity"  v={man.qty} s={v=>sm("qty",v)}  o={[["1","1 Unit"],["2","2 Units"],["3","3 Units"],["4","4 Units"]]}/>
                  <FieldSelect l="Refrigerant" v={man.ref} s={v=>sm("ref",v)} o={[["R22","R22"],["R407C","R407C"],["R410A","R410A"]]}/>
                  <FieldInput  l="Cooling @ 35°C (kcal/h)" p="61000" v={man.c35} s={v=>sm("c35",v)} t="number"/>
                  <FieldInput  l="Cooling @ 46°C (kcal/h)" p="53800" v={man.c46} s={v=>sm("c46",v)} t="number"/>
                </div>
                <SectionTitle title="AMBIENT TEMPERATURE"/>
                <div className="flex gap-2">
                  {["35","40","46","52"].map(t=>(
                    <button key={t} onClick={()=>setAmb(t)}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm ${amb===t?"bg-orange-700 text-white":"bg-slate-800 text-slate-300"}`}>
                      {t}°C
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-950 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
                ⚠️ {error}
              </div>
            )}

            <button onClick={analyze} disabled={loading}
              className="w-full py-4 rounded-xl font-black text-white tracking-widest uppercase text-sm"
              style={{background:loading?"#1e3a5f":"linear-gradient(135deg,#1d4ed8,#0891b2)",cursor:loading?"not-allowed":"pointer"}}>
              {loading?"⏳ Analyzing...":"🔍 Find ZR Replacement Model"}
            </button>
          </>
        ) : (
          <ResultView r={result} title={mode==="rua"?unit:man.model||"Unknown"} onBack={()=>{setResult(null);setError("");}}/>
        )}
      </div>

      <footer className="text-center text-xs text-slate-700 tracking-widest py-4 border-t border-slate-900">
        HITACHI RUA → COPELAND ZR · UAE CATALOG BASED · POWERED BY CLAUDE AI
      </footer>
    </div>
  );
}

function ResultView({r,title,onBack}){
  return (
    <div className="space-y-4">

      {/* TITLE */}
      <div className="bg-slate-800 rounded-xl px-4 py-3 flex items-center gap-3 border border-slate-600">
        <span className="text-2xl">🏭</span>
        <div>
          <div className="text-xs text-slate-400 tracking-widest">UNIT</div>
          <div className="font-black text-blue-400 tracking-wider">{title}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-400">AMBIENT</div>
          <div className="font-bold text-sm text-orange-400">{r.input?.ambient}°C</div>
        </div>
      </div>

      {/* PER COMPRESSOR */}
      {r.per_compressor && (
        <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5">
          <div className="text-xs text-blue-400 font-bold tracking-widest mb-3 uppercase">📊 Per Compressor — Calculated Capacity</div>
          <div className="grid grid-cols-2 gap-2">
            <SpecBox icon="📐" label="kcal/h"     val={Number(r.per_compressor.kcal_h).toLocaleString()}/>
            <SpecBox icon="📊" label="BTU/h"      val={Number(r.per_compressor.btu_h).toLocaleString()}/>
            <SpecBox icon="❄️" label="Tons (TR)"  val={`${r.per_compressor.tr} TR`} hl/>
            <SpecBox icon="⚡" label="kW Cooling" val={`${r.per_compressor.kw_cooling} kW`}/>
          </div>
        </div>
      )}

      {/* PRIMARY */}
      {r.primary_recommendation && (
        <div className="bg-slate-900 rounded-2xl border-2 border-green-700 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="bg-green-900 text-green-400 text-xs px-3 py-1 rounded-full font-bold tracking-widest">✅ PRIMARY RECOMMENDATION</span>
            <span className="text-xs text-green-400 font-bold">{r.primary_recommendation.match_percent}% Match</span>
          </div>
          <div className="text-3xl font-black text-blue-400 tracking-widest mb-4">{r.primary_recommendation.model}</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <SpecBox icon="❄️" label="Capacity (TR)"  val={`${r.primary_recommendation.capacity_tr} TR`} hl/>
            <SpecBox icon="📊" label="Capacity (BTU)" val={Number(r.primary_recommendation.capacity_btu).toLocaleString()}/>
            <SpecBox icon="📈" label="Est. COP"       val={r.primary_recommendation.cop}/>
            <SpecBox icon="🎯" label="Match"          val={`${r.primary_recommendation.match_percent}%`}/>
          </div>
          <div className="bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-300 border-l-4 border-green-500">
            <span className="text-green-400 font-bold">Reason: </span>{r.primary_recommendation.reason}
          </div>
        </div>
      )}

      {/* ALTERNATIVE */}
      {r.alternative?.model && (
        <div className="bg-slate-900 rounded-2xl border border-yellow-800 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="bg-yellow-900 text-yellow-400 text-xs px-3 py-1 rounded-full font-bold tracking-widest">🔄 ALTERNATIVE</span>
            <span className="text-xs text-yellow-400 font-bold">{r.alternative.match_percent}% Match</span>
          </div>
          <div className="text-2xl font-black text-yellow-400 tracking-widest mb-4">{r.alternative.model}</div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <SpecBox icon="❄️" label="Capacity (TR)"  val={`${r.alternative.capacity_tr} TR`}/>
            <SpecBox icon="📊" label="Capacity (BTU)" val={Number(r.alternative.capacity_btu).toLocaleString()}/>
            <SpecBox icon="📈" label="Est. COP"       val={r.alternative.cop}/>
            <SpecBox icon="🎯" label="Match"          val={`${r.alternative.match_percent}%`}/>
          </div>
          <div className="bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-300 border-l-4 border-yellow-500">
            <span className="text-yellow-400 font-bold">Reason: </span>{r.alternative.reason}
          </div>
        </div>
      )}

      {/* SYSTEM TOTAL */}
      {r.system_total && (
        <div className="bg-blue-950 rounded-2xl border border-blue-700 p-5">
          <div className="text-xs text-blue-400 font-bold tracking-widest mb-3 uppercase">🏭 System Total Summary</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <SpecBox icon="❄️" label="Total TR"    val={`${r.system_total.total_tr} TR`} hl/>
            <SpecBox icon="⚡" label="Total kW"    val={`${r.system_total.total_kw} kW`} hl/>
            <SpecBox icon="📊" label="Total BTU/h" val={Number(r.system_total.total_btu).toLocaleString()}/>
            <SpecBox icon="🔢" label="Compressors" val={r.system_total.compressor_qty}/>
          </div>
          <div className="bg-blue-900 rounded-lg px-4 py-3 text-blue-100 text-sm font-bold">
            🛒 Order: {r.system_total.order_quantity}
          </div>
        </div>
      )}

      {/* ENGINEERING STEPS */}
      {r.engineering_steps?.length>0 && (
        <div className="bg-slate-900 rounded-2xl border border-slate-700 p-5">
          <div className="text-xs text-blue-400 font-bold tracking-widest mb-4 uppercase">🧮 Engineering Calculation Steps</div>
          {r.engineering_steps.map((s,i)=>(
            <div key={i} className="flex gap-4 py-2 border-b border-slate-800 text-sm last:border-0">
              <span className="text-blue-500 font-black w-7 shrink-0">{String(i+1).padStart(2,"0")}</span>
              <span className="text-slate-300">{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* NOTES & WARNINGS */}
      {(r.oil_note||r.refrigerant_note||r.electrical_note||r.warnings?.length>0) && (
        <div className="bg-amber-950 rounded-2xl border border-amber-800 p-5">
          <div className="text-xs text-amber-400 font-bold tracking-widest mb-4 uppercase">⚠️ Engineering Notes</div>
          {r.refrigerant_note && <div className="bg-slate-900 rounded-lg px-4 py-3 text-blue-300 text-sm mb-2">🧊 <span className="font-bold">Refrigerant:</span> {r.refrigerant_note}</div>}
          {r.oil_note         && <div className="bg-slate-900 rounded-lg px-4 py-3 text-orange-300 text-sm mb-2">🛢️ <span className="font-bold">Oil:</span> {r.oil_note}</div>}
          {r.electrical_note  && <div className="bg-slate-900 rounded-lg px-4 py-3 text-yellow-300 text-sm mb-2">⚡ <span className="font-bold">Electrical:</span> {r.electrical_note}</div>}
          {r.warnings?.map((w,i)=>(
            <div key={i} className="text-amber-300 text-sm py-2 border-b border-amber-900 last:border-0">⚠️ {w}</div>
          ))}
        </div>
      )}

      <button onClick={onBack}
        className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-slate-300 tracking-widest uppercase text-sm"
        style={{cursor:"pointer"}}>
        ← New Analysis
      </button>
    </div>
  );
}

/* ─── Small Components ─── */
const SectionTitle = ({title}) => (
  <div className="text-xs tracking-widest text-blue-500 font-bold pb-2 border-b border-slate-800 uppercase">{title}</div>
);

const InfoBox = ({label,val}) => (
  <div className="bg-slate-900 rounded-lg p-3">
    <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
    <div className="text-sm font-bold text-slate-100 mt-1">{val}</div>
  </div>
);

const SpecBox = ({icon,label,val,hl}) => (
  <div className={`flex items-center gap-3 rounded-lg p-3 ${hl?"bg-blue-950 border border-blue-800":"bg-slate-800"}`}>
    <span className="text-xl">{icon}</span>
    <div>
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <d
