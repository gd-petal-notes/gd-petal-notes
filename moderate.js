// ============================================================
//  Petal Notes — Moderation page (#/moderate)
//  Moderators sign in with an emailed link. Only emails listed in the
//  Supabase `moderators` table can see held notes or change anything.
// ============================================================

(function () {
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const el = id => document.getElementById(id);
  let sb = null;
  let loading = null;

  const isModRoute = () => location.hash === "#/moderate";
  const fromLoginLink = () => new URLSearchParams(location.search).has("moderate");

  function loadClient() {
    if (sb) return Promise.resolve(sb);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SUPABASE_JS;
      s.onload = () => {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "pn-mod-auth" }
        });
        sb.auth.onAuthStateChange(() => { if (isModRoute()) render(); });
        resolve(sb);
      };
      s.onerror = () => reject(new Error("Could not load sign-in library"));
      document.head.appendChild(s);
    });
    return loading;
  }

  function show(state) {
    ["mod-signin", "mod-denied", "mod-panel", "mod-loading"].forEach(id => el(id).hidden = id !== state);
  }

  async function render() {
    show("mod-loading");
    try { await loadClient(); } catch (e) { el("mod-loading").textContent = e.message; return; }

    const { data: { session } } = await sb.auth.getSession();
    if (!session) return show("mod-signin");

    el("mod-who").textContent = session.user.email;
    el("mod-who2").textContent = session.user.email;
    const { data: isMod, error } = await sb.rpc("is_moderator");
    if (error || !isMod) return show("mod-denied");

    show("mod-panel");
    await loadQueue();
  }

  // ---- SIGN IN ----
  el("mod-send").onclick = async () => {
    const email = el("mod-email").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Please enter a valid email");
    const btn = el("mod-send");
    btn.disabled = true;
    btn.textContent = "Sending...";
    try {
      await loadClient();
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.origin + "/?moderate" }
      });
      if (error) throw error;
      el("mod-sent").hidden = false;
      el("mod-sent").textContent = "Check " + email + " for a sign-in link. Open it on this device.";
    } catch (e) {
      console.error(e);
      const limited = /rate|limit|security purposes/i.test(e.message || "");
      toast(limited ? "Too many sign-in emails right now. Please try again a bit later." : "Could not send the sign-in link. Please try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send sign-in link";
    }
  };

  async function signOut() {
    if (sb) await sb.auth.signOut();
    render();
  }
  el("mod-signout").onclick = signOut;
  el("mod-signout2").onclick = signOut;

  // ---- QUEUE ----
  async function loadQueue() {
    const { data, error } = await sb
      .from("notes")
      .select("id,topic,body,author,approved,flagged,created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) { console.error(error); return toast("Could not load notes"); }

    const held = data.filter(n => !n.approved);
    const live = data.filter(n => n.approved);
    el("mod-held-count").textContent = held.length;
    el("mod-live-count").textContent = live.length;
    fill("mod-held", held, "Nothing waiting for review.");
    fill("mod-live", live, "No notes on the wall yet.");
  }

  function fill(listId, items, emptyText) {
    const list = el(listId);
    list.innerHTML = "";
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "mod-empty";
      p.textContent = emptyText;
      list.appendChild(p);
      return;
    }
    items.forEach(n => list.appendChild(card(n)));
  }

  function card(n) {
    const c = document.createElement("article");
    c.className = "mod-card";

    const head = document.createElement("div");
    head.className = "mod-card-head";
    const h = document.createElement("h3");
    h.textContent = n.topic;
    head.appendChild(h);
    if (n.flagged && !n.approved) {
      const b = document.createElement("span");
      b.className = "mod-badge";
      b.textContent = "Caught by filter";
      head.appendChild(b);
    }

    const meta = document.createElement("div");
    meta.className = "mod-meta";
    meta.textContent = "— " + (n.author || "Anonymous") + " · " + new Date(n.created_at).toLocaleString();

    const body = document.createElement("p");
    body.className = "mod-body";
    body.textContent = n.body;

    const actions = document.createElement("div");
    actions.className = "mod-actions";
    actions.appendChild(button(n.approved ? "Hide" : "Approve", n.approved ? "ghost" : "", () => setApproved(n, !n.approved)));
    actions.appendChild(button("Delete", "ghost danger", () => remove(n)));

    c.append(head, meta, body, actions);
    return c;
  }

  function button(label, cls, onClick) {
    const b = document.createElement("button");
    b.className = ("btn small " + cls).trim();
    b.textContent = label;
    b.onclick = async () => {
      b.disabled = true;
      try { await onClick(); } finally { b.disabled = false; }
    };
    return b;
  }

  async function setApproved(n, approved) {
    const { error } = await sb.from("notes").update({ approved }).eq("id", n.id);
    if (error) { console.error(error); return toast("Could not update the note"); }
    toast(approved ? "Note is now on the wall" : "Note hidden from the wall");
    await loadQueue();
    if (typeof loadNotes === "function") loadNotes();
  }

  async function remove(n) {
    if (!confirm('Delete "' + n.topic + '" permanently?')) return;
    const { error } = await sb.from("notes").delete().eq("id", n.id);
    if (error) { console.error(error); return toast("Could not delete the note"); }
    toast("Note deleted");
    await loadQueue();
    if (typeof loadNotes === "function") loadNotes();
  }

  el("mod-refresh").onclick = loadQueue;

  // ---- ENTRY POINTS ----
  addEventListener("hashchange", () => { if (isModRoute()) render(); });

  if (fromLoginLink()) {
    // Returning from the emailed sign-in link: let the client read the
    // tokens from the URL, then tidy the address and open the page.
    loadClient().then(() => sb.auth.getSession()).then(() => {
      history.replaceState(null, "", location.pathname + "#/moderate");
      route();
      render();
    });
  } else if (isModRoute()) {
    render();
  }
})();
