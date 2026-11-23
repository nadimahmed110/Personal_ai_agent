const $ = id => document.getElementById(id);
const chat = $("chat"), promptBox = $("prompt");
let history = [];
let settings = JSON.parse(localStorage.getItem("pai-settings") || "{}");
function applySettings(){
  $("systemPrompt").value = settings.systemPrompt || "";
  $("allowFiles").checked = settings.files !== false;
  $("allowWrite").checked = settings.write !== false;
  $("allowTerminal").checked = settings.terminal === true;
}
function addMessage(role, content){
  const row = document.createElement("div"); row.className = `msg ${role}`;
  const bubble = document.createElement("div"); bubble.className = "bubble";
  bubble.textContent = content; row.appendChild(bubble); chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight; return row;
}
async function status(){
  try { const r=await fetch("/api/status"); const s=await r.json(); $("status").textContent=s.configured?`Online · ${s.model}`:"API key setup needed"; }
  catch { $("status").textContent="Server not reachable"; }
}
$("settingsBtn").onclick=()=>{applySettings();$("settings").showModal()};
$("closeSettings").onclick=()=>$("settings").close();
$("saveSettings").onclick=()=>{
  settings={systemPrompt:$("systemPrompt").value,files:$("allowFiles").checked,write:$("allowWrite").checked,terminal:$("allowTerminal").checked};
  localStorage.setItem("pai-settings",JSON.stringify(settings));$("settings").close();
};
document.querySelectorAll(".suggestions button").forEach(b=>b.onclick=()=>{promptBox.value=b.textContent;promptBox.focus()});
$("composer").addEventListener("submit",async e=>{
  e.preventDefault(); const text=promptBox.value.trim(); if(!text)return;
  const first=chat.querySelector(".welcome"); if(first)first.remove();
  addMessage("user",text); history.push({role:"user",content:text}); promptBox.value=""; promptBox.style.height="auto";
  const wait=addMessage("assistant","ভাবছি...");
  $("send").disabled=true;
  try{
    const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history,systemPrompt:settings.systemPrompt||"",permissions:{files:settings.files!==false,write:settings.write!==false,terminal:settings.terminal===true}})});
    const data=await r.json(); if(!r.ok)throw new Error(data.error||"Request failed");
    wait.querySelector(".bubble").textContent=data.answer;history.push({role:"assistant",content:data.answer});
  }catch(err){wait.querySelector(".bubble").textContent="সমস্যা হয়েছে: "+err.message;}
  finally{$("send").disabled=false;chat.scrollTop=chat.scrollHeight;}
});
promptBox.addEventListener("input",()=>{promptBox.style.height="auto";promptBox.style.height=Math.min(promptBox.scrollHeight,150)+"px"});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
status();applySettings();