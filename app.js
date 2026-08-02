import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/* =========================================================
   PASTE ONLY YOUR BROWSER-SAFE PUBLISHABLE KEY BELOW.
   Never paste an sb_secret_ or service_role key here.
   ========================================================= */
const SUPABASE_URL = "https://nffwhypkffajugilmjkl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7OFmqMJxBOShYwM8OVhfkQ_B0fjch37";

const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: "tt-chat-auth",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const $ = (id) => document.getElementById(id);
const state = {
  mode: "signin",
  user: null,
  profile: null,
  messages: [],
  reactions: [],
  polls: [],
  pollOptions: [],
  pollVotes: [],
  replyTo: null,
  imageFile: null,
  pageSize: 40,
  oldestLoaded: null,
  channels: [],
  presenceChannel: null,
  activeView: "live",
chatStarted: false
};

const reactionMap = { heart:"❤️", fire:"🔥", tennis:"🎾", money:"💰" };
const allowedReactions = Object.keys(reactionMap);

function toast(message, isError=false){
  const el = $("toast");
  el.textContent = message;
  el.style.borderColor = isError ? "var(--red)" : "var(--line)";
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>el.classList.remove("show"), 2600);
}
function esc(value=""){
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}
function initials(name="Member"){
  return name.trim().split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase() || "TT";
}
function timeAgo(value){
  const t = new Date(value).getTime();
  if(!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now()-t)/1000));
  if(sec < 45) return "just now";
  if(sec < 3600) return `${Math.floor(sec/60)}m ago`;
  if(sec < 86400) return `${Math.floor(sec/3600)}h ago`;
  if(sec < 604800) return `${Math.floor(sec/86400)}d ago`;
  return new Date(value).toLocaleDateString();
}
function profileAvatar(profile, cls="avatar"){
  const name = profile?.display_name || "Member";
  return profile?.avatar_url
    ? `<span class="${cls}"><img src="${esc(profile.avatar_url)}" alt=""></span>`
    : `<span class="${cls}">${esc(initials(name))}</span>`;
}
function imagePublicUrl(path){
  if(!path) return "";
  return db.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
}
function setBusy(button, busy, label){
  button.disabled = busy;
  if(label) button.textContent = busy ? "Working…" : label;
}

async function ensureConfigured(){
  if(SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR")){
    document.body.innerHTML = `<main class="auth-shell"><section class="auth-card">
      <h1>Configuration needed</h1>
      <p class="muted">Open <b>app.js</b> and replace <code>PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE</code> with your Supabase publishable key.</p>
    </section></main>`;
    return false;
  }
  return true;
}

/* AUTH */
function setAuthMode(mode){
  state.mode = mode;
  const signup = mode === "signup";
  $("showSignIn").classList.toggle("active", !signup);
  $("showSignUp").classList.toggle("active", signup);
  $("displayNameWrap").classList.toggle("hidden", !signup);
  $("authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("passwordInput").autocomplete = signup ? "new-password" : "current-password";
  $("authHelp").textContent = "";
}
async function submitAuth(event){
  event.preventDefault();
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;
  const displayName = $("displayNameInput").value.trim();
  setBusy($("authSubmit"), true);
  try{
    if(state.mode === "signup"){
      if(!displayName) throw new Error("Enter a display name.");
      const { data, error } = await db.auth.signUp({
        email, password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: location.origin + location.pathname
        }
      });
      if(error) throw error;
      $("authHelp").textContent = data.session
        ? "Account created."
        : "Check your email to confirm your account, then return here to sign in.";
    }else{
      const { error } = await db.auth.signInWithPassword({ email, password });
      if(error) throw error;
    }
  }catch(err){
    toast(err.message || "Authentication failed.", true);
  }finally{
    setBusy($("authSubmit"), false, state.mode === "signup" ? "Create account" : "Sign in");
  }
}
async function forgotPassword(){
  const email = $("emailInput").value.trim();
  if(!email) return toast("Enter your email first.", true);
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  if(error) return toast(error.message, true);
  toast("Password reset email sent.");
}
async function loadProfile()async function openChat(){
  $("authView").classList.add("hidden");
  $("welcomeView").classList.add("hidden");
  $("chatView").classList.remove("hidden");

  if(state.chatStarted) return;
  state.chatStarted = true;

  await Promise.all([
    loadMessages(true),
    loadReactions(),
    loadPollData()
  ]);

  subscribeRealtime();
  startPresence();
  renderAll();
}{
  const { data, error } = await db.from("profiles").select("*").eq("id", state.user.id).single();
  if(error) throw error;
  state.profile = data;
  $("headerName").textContent = data.display_name || "Member";
  $("headerAvatar").outerHTML = profileAvatar(data, "mini-avatar").replace(
    'class="mini-avatar"', 'id="headerAvatar" class="mini-avatar"'
  );
  $("createPollBtn").classList.toggle("hidden", data.role !== "admin");
  $("profileSummary").innerHTML = `
    <div class="profile-row">
      ${profileAvatar(data,"profile-big")}
      <div><strong>${esc(data.display_name||"Member")}</strong>
      <div class="muted small">${esc(data.badge||"Member")} · ${esc(data.role)}</div>
          </div>`;
}
async function enterChat(user){
  state.user = user;

  $("authView").classList.add("hidden");
  $("welcomeView").classList.add("hidden");
  $("chatView").classList.add("hidden");

  try{
    await loadProfile();

    if(state.profile.welcome_seen !== true){
      $("welcomeView").classList.remove("hidden");

      requestAnimationFrame(()=>{
        $("enterChatBtn")?.focus();
      });

      return;
    }

    await openChat();

  }catch(err){
    console.error(err);
    toast(err.message || "Could not load TT Chat.", true);
  }
}
async function leaveChat(){
  state.channels.forEach(ch=>db.removeChannel(ch));
  state.channels = [];
  if(state.presenceChannel) db.removeChannel(state.presenceChannel);
  state.presenceChannel = null;
  state.user = null; state.profile = null;
  $("chatView").classList.add("hidden");
  $("authView").classList.remove("hidden");
}
async function signOut(){
  await db.auth.signOut();
}

/* DATA */
async function loadMessages(reset=false){
  let query = db.from("messages")
    .select("*, profile:user_id(id,display_name,avatar_url,badge,role), reply:reply_to_id(id,body,user_id,profile:user_id(display_name))")
    .order("created_at",{ascending:false})
    .limit(state.pageSize);
  if(!reset && state.oldestLoaded) query = query.lt("created_at", state.oldestLoaded);
  const { data, error } = await query;
  if(error) throw error;
  const batch = data || [];
  if(reset) state.messages = batch;
  else state.messages = [...state.messages, ...batch];
  state.oldestLoaded = state.messages.length
    ? state.messages[state.messages.length-1].created_at : null;
  $("loadMoreBtn").classList.toggle("hidden", batch.length < state.pageSize);
}
async function loadReactions(){
  const ids = state.messages.map(m=>m.id);
  if(!ids.length){ state.reactions=[]; return; }
  const { data, error } = await db.from("reactions").select("*").in("message_id", ids);
  if(error) throw error;
  state.reactions = data || [];
}
async function loadPollData(){
  const { data:polls,error:pErr } = await db.from("polls")
    .select("*, profile:created_by(display_name,badge)")
    .order("created_at",{ascending:false});
  if(pErr) throw pErr;
  state.polls = polls || [];
  const pollIds = state.polls.map(p=>p.id);
  if(!pollIds.length){ state.pollOptions=[]; state.pollVotes=[]; return; }
  const [{data:opts,error:oErr},{data:votes,error:vErr}] = await Promise.all([
    db.from("poll_options").select("*").in("poll_id",pollIds).order("display_order"),
    db.from("poll_votes").select("*").in("poll_id",pollIds)
  ]);
  if(oErr) throw oErr;
  if(vErr) throw vErr;
  state.pollOptions = opts || [];
  state.pollVotes = votes || [];
}

/* RENDER */
function renderAll(){
  renderMessages();
  renderPinned();
  renderPolls();
  renderPinnedBanner();
}
function reactionSummary(messageId){
  const rows = state.reactions.filter(r=>r.message_id===messageId);
  const out = {};
  allowedReactions.forEach(type=>{
    const typed = rows.filter(r=>r.reaction===type);
    out[type] = { count:typed.length, mine:typed.some(r=>r.user_id===state.user.id) };
  });
  return out;
}
function messageHTML(m){
  const profile = m.profile || {display_name:"Member",badge:"Member"};
  const reactions = reactionSummary(m.id);
  const image = m.image_path ? `<img class="post-image" src="${esc(imagePublicUrl(m.image_path))}" alt="Chat upload" loading="lazy">` : "";
  const reply = m.reply ? `<div class="reply-quote">↳ Replying to ${esc(m.reply.profile?.display_name||"member")}: ${esc((m.reply.body||"Image post").slice(0,120))}</div>` : "";
  const body = m.body ? `<div class="post-body">${esc(m.body)}${m.edited_at?'<span class="post-edited">(edited)</span>':""}</div>` : "";
  const reactionButtons = allowedReactions.map(type=>{
    const item = reactions[type];
    return `<button class="reaction-btn ${item.mine?"mine":""}" data-reaction="${type}" data-id="${m.id}" type="button">${reactionMap[type]}${item.count?` ${item.count}`:""}</button>`;
  }).join("");
  return `<article class="post" data-message-id="${m.id}">
    <div class="post-head">
      ${profileAvatar(profile)}
      <div class="author-meta"><div class="author-name">${esc(profile.display_name||"Member")}</div>
      <div class="author-badge">${esc(profile.badge||"Member")}</div></div>
      <div class="post-time">${timeAgo(m.created_at)}</div>
      ${(state.profile?.role==="admin"||m.user_id===state.user.id)?`<button class="post-menu" data-id="${m.id}" type="button">⋮</button>`:""}
    </div>
    ${reply}${image}${body}
    <div class="actions">${reactionButtons}<button class="reply-btn" data-reply="${m.id}" type="button">Reply</button></div>
  </article>`;
}
function bindMessageActions(container){
  container.querySelectorAll("[data-reaction]").forEach(btn=>{
    btn.onclick=()=>toggleReaction(btn.dataset.id,btn.dataset.reaction);
  });
  container.querySelectorAll("[data-reply]").forEach(btn=>{
    const m=state.messages.find(x=>x.id===btn.dataset.reply);
    if(m) setReply(m);
  });
  container.querySelectorAll(".post-menu").forEach(btn=>{
    btn.onclick=(e)=>openMessageMenu(e,btn.dataset.id);
  });
  container.querySelectorAll(".post-image").forEach(img=>{
    img.ondblclick=()=>{
      const post=img.closest("[data-message-id]");
      if(post) toggleReaction(post.dataset.messageId,"heart");
    };
  });
}
function renderMessages(){
  const ordered=[...state.messages].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  $("messageFeed").innerHTML = ordered.length ? ordered.map(messageHTML).join("") : `<div class="empty-state">No messages yet. Start the conversation.</div>`;
  bindMessageActions($("messageFeed"));
}
function renderPinned(){
  const pinned=[...state.messages].filter(m=>m.is_pinned).sort((a,b)=>new Date(b.pinned_at||b.created_at)-new Date(a.pinned_at||a.created_at));
  $("pinnedFeed").innerHTML = pinned.length ? pinned.map(messageHTML).join("") : `<div class="empty-state">No pinned messages.</div>`;
  bindMessageActions($("pinnedFeed"));
}
function renderPinnedBanner(){
  const pinned=[...state.messages].filter(m=>m.is_pinned).sort((a,b)=>new Date(b.pinned_at||b.created_at)-new Date(a.pinned_at||a.created_at))[0];
  $("pinnedBanner").classList.toggle("hidden",!pinned);
  if(pinned) $("pinnedBannerText").textContent=pinned.body||"Image post";
}
function pollCardHTML(poll){
  const options=state.pollOptions.filter(o=>o.poll_id===poll.id);
  const votes=state.pollVotes.filter(v=>v.poll_id===poll.id);
  const myVote=votes.find(v=>v.user_id===state.user.id);
  const total=votes.length;
  const optionHtml=options.map(opt=>{
    const count=votes.filter(v=>v.option_id===opt.id).length;
    const pct=total?Math.round(count/total*100):0;
    return `<button class="poll-option" data-poll="${poll.id}" data-option="${opt.id}" type="button" ${!poll.is_active?"disabled":""}>
      <span class="poll-option-bar" style="width:${pct}%"></span>
      <span class="poll-option-content"><span>${esc(opt.option_text)}${myVote?.option_id===opt.id?" ✓":""}</span><span>${pct}%</span></span>
    </button>`;
  }).join("");
  const admin=state.profile?.role==="admin"?`<div class="poll-admin">
    <button class="text-btn" data-close-poll="${poll.id}" type="button">${poll.is_active?"Close poll":"Reopen poll"}</button>
    <button class="text-btn" data-pin-poll="${poll.id}" type="button">${poll.is_pinned?"Unpin":"Pin"}</button>
    <button class="text-btn" data-delete-poll="${poll.id}" type="button">Delete</button>
  </div>`:"";
  return `<article class="poll-card">
    <div class="poll-question">${esc(poll.question)}</div>
    ${optionHtml}
    <div class="poll-meta">${total} vote${total===1?"":"s"} · ${poll.is_active?"Active":"Closed"} · ${timeAgo(poll.created_at)}</div>
    ${admin}
  </article>`;
}
function renderPolls(){
  $("pollFeed").innerHTML=state.polls.length?state.polls.map(pollCardHTML).join(""):`<div class="empty-state">No polls yet.</div>`;
  $("pollFeed").querySelectorAll("[data-option]").forEach(btn=>btn.onclick=()=>castVote(btn.dataset.poll,btn.dataset.option));
  $("pollFeed").querySelectorAll("[data-close-poll]").forEach(btn=>btn.onclick=()=>togglePollActive(btn.dataset.closePoll));
  $("pollFeed").querySelectorAll("[data-pin-poll]").forEach(btn=>btn.onclick=()=>togglePollPinned(btn.dataset.pinPoll));
  $("pollFeed").querySelectorAll("[data-delete-poll]").forEach(btn=>btn.onclick=()=>deletePoll(btn.dataset.deletePoll));
}

/* CHAT ACTIONS */
async function uploadImage(file){
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error }=await db.storage.from("chat-images").upload(path,file,{cacheControl:"3600",upsert:false});
  if(error) throw error;
  return path;
}
async function sendMessage(event){
  event.preventDefault();
  const body=$("messageInput").value.trim();
  if(!body&&!state.imageFile) return;
  setBusy($("sendBtn"),true);
  try{
    const image_path=state.imageFile?await uploadImage(state.imageFile):null;
    const { error }=await db.from("messages").insert({
      user_id:state.user.id,body:body||null,image_path,reply_to_id:state.replyTo?.id||null
    });
    if(error) throw error;
    $("messageInput").value="";
    clearImage();
    clearReply();
  }catch(err){ toast(err.message||"Could not send message.",true); }
  finally{ setBusy($("sendBtn"),false); $("sendBtn").textContent="➤"; }
}
function chooseImage(){
  $("imageInput").click();
}
function previewImage(file){
  if(!file) return;
  if(file.size>10*1024*1024) return toast("Image must be 10 MB or smaller.",true);
  state.imageFile=file;
  $("imagePreview").src=URL.createObjectURL(file);
  $("imagePreviewWrap").classList.remove("hidden");
}
function clearImage(){
  state.imageFile=null;$("imageInput").value="";$("imagePreviewWrap").classList.add("hidden");
}
function setReply(message){
  state.replyTo=message;
  $("replyLabel").textContent=`Replying to ${message.profile?.display_name||"member"}`;
  $("replyPreview").textContent=(message.body||"Image post").slice(0,150);
  $("replyBar").classList.remove("hidden");
  $("messageInput").focus();
}
function clearReply(){state.replyTo=null;$("replyBar").classList.add("hidden")}
async function toggleReaction(messageId,type){
  if(!allowedReactions.includes(type)) return;
  const current=state.reactions.find(r=>r.message_id===messageId&&r.user_id===state.user.id&&r.reaction===type);
  const { error }=current
    ? await db.from("reactions").delete().eq("id",current.id)
    : await db.from("reactions").insert({message_id:messageId,user_id:state.user.id,reaction:type});
  if(error) toast(error.message,true);
}
function openMessageMenu(event,messageId){
  const m=state.messages.find(x=>x.id===messageId); if(!m)return;
  const menu=$("adminMenu");
  const isAdmin=state.profile?.role==="admin";
  const isOwner=m.user_id===state.user.id;
  menu.innerHTML=`
    ${isAdmin?`<button data-action="pin">${m.is_pinned?"Unpin":"Pin"}</button>`:""}
    ${isOwner?`<button data-action="edit">Edit</button>`:""}
    ${(isAdmin||isOwner)?`<button class="danger" data-action="delete">Delete</button>`:""}`;
  const rect=event.currentTarget.getBoundingClientRect();
  menu.style.top=`${Math.min(innerHeight-170,rect.bottom+4)}px`;
  menu.style.left=`${Math.max(8,Math.min(innerWidth-158,rect.right-150))}px`;
  menu.classList.remove("hidden");
  menu.querySelectorAll("button").forEach(btn=>btn.onclick=async()=>{
    menu.classList.add("hidden");
    if(btn.dataset.action==="pin") await togglePin(m);
    if(btn.dataset.action==="edit") await editMessage(m);
    if(btn.dataset.action==="delete") await deleteMessage(m);
  });
}
async function togglePin(m){
  const next=!m.is_pinned;
  const { error }=await db.from("messages").update({
    is_pinned:next,pinned_at:next?new Date().toISOString():null,pinned_by:next?state.user.id:null
  }).eq("id",m.id);
  if(error) toast(error.message,true);
}
async function editMessage(m){
  const next=prompt("Edit message:",m.body||"");
  if(next===null)return;
  const body=next.trim();
  if(!body&&!m.image_path)return toast("Message cannot be empty.",true);
  const { error }=await db.from("messages").update({body:body||null}).eq("id",m.id);
  if(error) toast(error.message,true);
}
async function deleteMessage(m){
  if(!confirm("Delete this post?"))return;
  const { error }=await db.from("messages").delete().eq("id",m.id);
  if(error) toast(error.message,true);
  if(!error&&m.image_path) await db.storage.from("chat-images").remove([m.image_path]);
}

/* POLLS */
async function createPoll(event){
  event.preventDefault();
  if(state.profile?.role!=="admin")return;
  const question=$("pollQuestion").value.trim();
  const options=[...document.querySelectorAll(".poll-option-input")].map(x=>x.value.trim()).filter(Boolean);
  if(!question||options.length<2)return toast("Enter a question and at least two options.",true);
  const { data:poll,error }=await db.from("polls").insert({
    created_by:state.user.id,question,is_pinned:$("pollPinned").checked
  }).select().single();
  if(error)return toast(error.message,true);
  const { error:optErr }=await db.from("poll_options").insert(options.map((option_text,i)=>({
    poll_id:poll.id,option_text,display_order:i+1
  })));
  if(optErr)return toast(optErr.message,true);
  $("pollForm").reset();$("pollDialog").close();toast("Poll published.");
}
async function castVote(pollId,optionId){
  const existing=state.pollVotes.find(v=>v.poll_id===pollId&&v.user_id===state.user.id);
  const result=existing
    ? await db.from("poll_votes").update({option_id:optionId}).eq("id",existing.id)
    : await db.from("poll_votes").insert({poll_id:pollId,option_id:optionId,user_id:state.user.id});
  if(result.error)toast(result.error.message,true);
}
async function togglePollActive(id){
  const p=state.polls.find(x=>x.id===id);if(!p)return;
  const {error}=await db.from("polls").update({is_active:!p.is_active}).eq("id",id);
  if(error)toast(error.message,true);
}
async function togglePollPinned(id){
  const p=state.polls.find(x=>x.id===id);if(!p)return;
  const {error}=await db.from("polls").update({is_pinned:!p.is_pinned}).eq("id",id);
  if(error)toast(error.message,true);
}
async function deletePoll(id){
  if(!confirm("Delete this poll and its votes?"))return;
  const {error}=await db.from("polls").delete().eq("id",id);
  if(error)toast(error.message,true);
}

/* REALTIME */
function subscribeRealtime(){
  state.channels.forEach(ch=>db.removeChannel(ch));
  state.channels=[];
  const tables=["messages","reactions","polls","poll_options","poll_votes"];
  tables.forEach(table=>{
    const ch=db.channel(`tt-${table}`)
      .on("postgres_changes",{event:"*",schema:"public",table},async()=>{
        try{
          if(table==="messages"){await loadMessages(true);await loadReactions()}
          else if(table==="reactions")await loadReactions();
          else await loadPollData();
          renderAll();
        }catch(err){console.error(err)}
      }).subscribe();
    state.channels.push(ch);
  });
}
function startPresence(){
  state.presenceChannel=db.channel("tt-chat-presence",{config:{presence:{key:state.user.id}}});
  state.presenceChannel
    .on("presence",{event:"sync"},renderPresence)
    .on("presence",{event:"join"},renderPresence)
    .on("presence",{event:"leave"},renderPresence)
    .subscribe(async status=>{
      if(status==="SUBSCRIBED"){
        await state.presenceChannel.track({
          user_id:state.user.id,
          display_name:state.profile.display_name,
          avatar_url:state.profile.avatar_url,
          online_at:new Date().toISOString()
        });
      }
    });
  const heartbeat=setInterval(async()=>{
    if(!state.user){clearInterval(heartbeat);return}
    await db.from("profiles").update({last_seen_at:new Date().toISOString()}).eq("id",state.user.id);
  },60000);
}
function renderPresence(){
  if(!state.presenceChannel)return;
  const raw=state.presenceChannel.presenceState();
  const people=Object.values(raw).flat().filter(Boolean);
  const unique=[...new Map(people.map(p=>[p.user_id,p])).values()];
  $("onlineCount").textContent=`${unique.length} Member${unique.length===1?"":"s"} Online`;
  $("activeNowList").innerHTML=unique.length?unique.slice(0,12).map(p=>
    `<div class="active-person"><span class="active-dot"></span><span>${esc(p.display_name||"Member")}</span></div>`
  ).join(""):`<span class="muted small">No members online.</span>`;
}

/* UI */
function switchView(view){
  state.activeView=view;
  document.querySelectorAll(".top-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $(`${view}View`).classList.add("active");
}
function autoGrow(){
  const el=$("messageInput");el.style.height="auto";el.style.height=`${Math.min(el.scrollHeight,130)}px`;
}
function bindUI(){
  $("showSignIn").onclick=()=>setAuthMode("signin");
  $("showSignUp").onclick=()=>setAuthMode("signup");
  $("authForm").onsubmit=submitAuth;
  $("forgotPassword").onclick=forgotPassword;
  $("composer").onsubmit=sendMessage;
  $("attachBtn").onclick=chooseImage;
  $("imageInput").onchange=e=>previewImage(e.target.files?.[0]);
  $("removeImage").onclick=clearImage;
  $("cancelReply").onclick=clearReply;
  $("messageInput").oninput=autoGrow;
  $("loadMoreBtn").onclick=async()=>{await loadMessages(false);await loadReactions();renderMessages()};
  $("profileBtn").onclick=()=>$("profileDialog").showModal();
  $("closeProfileDialog").onclick=()=>$("profileDialog").close();
  $("signOutBtn").onclick=signOut;
  $("createPollBtn").onclick=()=>{$("profileDialog").close();$("pollDialog").showModal()};
  $("closePollDialog").onclick=()=>$("pollDialog").close();
  $("pollForm").onsubmit=createPoll;
  $("viewPinnedBtn").onclick=()=>switchView("pinned");
  document.querySelectorAll(".top-tab").forEach(btn=>btn.onclick=()=>switchView(btn.dataset.view));
  document.querySelectorAll("[data-placeholder]").forEach(btn=>btn.onclick=()=>{
    $("placeholderTitle").textContent=btn.dataset.placeholder;$("placeholderDialog").showModal();
  });
  $("closePlaceholderDialog").onclick=()=>$("placeholderDialog").close();
  document.addEventListener("click",e=>{
    if(!e.target.closest(".post-menu")&&!e.target.closest("#adminMenu"))$("adminMenu").classList.add("hidden");
  });
}

/* BOOT */
async function boot(){
  bindUI();
  if(!await ensureConfigured())return;
  const { data:{session} }=await db.auth.getSession();
  if(session?.user)await enterChat(session.user);
  db.auth.onAuthStateChange(async(event,sessionNow)=>{
    if(event==="SIGNED_IN"&&sessionNow?.user&&!state.user)await enterChat(sessionNow.user);
    if(event==="SIGNED_OUT")await leaveChat();
  });
}
boot();
