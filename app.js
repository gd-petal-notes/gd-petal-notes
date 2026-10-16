// ============================================================
//  Petal Notes — App Logic
//  GDC · Graphic Design Club · Breast Cancer Awareness
// ============================================================

// ---- SUPABASE ----
// The publishable key is public by design; row-level security on the `notes`
// table lets the public read approved notes and submit new ones (published
// immediately; hide a note by unticking `approved` in the Supabase dashboard).
const SUPABASE_URL = "https://uqlxpieczzplxtmvfpgw.supabase.co";
const SUPABASE_KEY = "sb_publishable_dTpv3U9pnSwRUIzULl0JWg_cWw3pUJT";
const API = SUPABASE_URL + "/rest/v1/notes";
const HEADERS = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };

let notes = [];

async function loadNotes() {
  try {
    const r = await fetch(API + "?select=id,topic,body,author&order=created_at.desc&limit=500", { headers: HEADERS });
    if (!r.ok) throw new Error(r.status);
    notes = await r.json();
  } catch (e) {
    console.error("Could not load notes", e);
    notes = null;
  }
  renderWall();
}

async function submitNote(note) {
  const r = await fetch(API, { method: "POST", headers: { ...HEADERS, Prefer: "return=minimal" }, body: JSON.stringify(note) });
  if (!r.ok) throw new Error(r.status);
}

// ---- HELPERS ----
const $ = s => document.querySelector(s);
const words   = t => t.trim().split(/\s+/).filter(Boolean);
const excerpt = (t, n = 14) => { const w = words(t); return w.length > n ? w.slice(0, n).join(" ") + "..." : t; };
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const cardHTML = n => {
  const c = words(n.body).length;
  return `<h3>${esc(n.topic || "Untitled")}</h3>
          <p>${esc(excerpt(n.body))}</p>
          <div class="meta">
            <span>— ${esc(n.author || "Anonymous")}</span>
            <span class="more">${c > 14 ? "Read all " + c + " words &rarr;" : "Read &rarr;"}</span>
          </div>`;
};

// ---- NOTES WALL ----
function renderWall() {
  const w = $("#wall");
  w.innerHTML = "";
  if (!notes || !notes.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = notes ? "No notes yet. Be the first to leave a kind word." : "Notes could not be loaded right now. Please try again in a moment.";
    w.appendChild(p);
    return;
  }
  notes.forEach(n => {
    const b = document.createElement("button");
    b.className = "note";
    b.innerHTML = cardHTML(n);
    b.setAttribute("aria-label", "Read note: " + n.topic);
    b.onclick = () => openNote(n);
    w.appendChild(b);
  });
}

// ---- DIALOG ----
function openNote(n) {
  $("#dt").textContent = n.topic;
  $("#db").textContent = n.body;
  $("#dm").innerHTML = `<span>— ${esc(n.author || "Anonymous")}</span><span>${words(n.body).length} words</span>`;
  $("#dlg").showModal();
}

$("#close").onclick = () => $("#dlg").close();
$("#dlg").addEventListener("click", e => { if (e.target.id === "dlg") e.target.close(); });

// ---- WRITE / PREVIEW ----
function preview() {
  const t = $("#topic").value, m = $("#msg").value, c = words(m).length;
  $("#tc").textContent = t.length + "/60";
  $("#wc").textContent = c + "/500 words";
  $("#pv").innerHTML = cardHTML({
    topic:  t || "Your topic",
    body:   m || "Your message will start here...",
    author: $("#nm").value
  });
}

["#topic", "#msg", "#nm"].forEach(s => $(s).addEventListener("input", preview));

// ---- TOAST ----
function toast(t) {
  const e = $("#toast");
  e.textContent = t;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 2800);
}

// ---- SUBMIT ----
$("#send").onclick = async () => {
  const t = $("#topic").value.trim(), m = $("#msg").value.trim();
  if (!t || !m) return toast("Please add a topic and a message");
  if (words(m).length > 500) return toast("Please keep it under 500 words");
  const btn = $("#send");
  btn.disabled = true;
  btn.textContent = "Sending...";
  try {
    await submitNote({ topic: t, body: m, author: $("#nm").value.trim() || "Anonymous" });
    ["#topic", "#msg", "#nm"].forEach(s => $(s).value = "");
    preview();
    toast("Thank you! Your note is on the wall.");
    location.hash = "#/home";
    loadNotes();
  } catch (e) {
    console.error("Could not send note", e);
    toast("Sorry, your note could not be sent. Please try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send note";
  }
};

// ---- ROUTER ----
function route() {
  const p = (location.hash.replace("#/", "") || "home");
  const pg = ["home", "write", "about"].includes(p) ? p : "home";
  document.querySelectorAll(".page").forEach(e => e.classList.toggle("on", e.id === "p-" + pg));
  document.querySelectorAll("[data-nav]").forEach(a => {
    a.removeAttribute("aria-current");
    if (a.dataset.nav === pg) a.setAttribute("aria-current", "page");
  });
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);

// ---- THEME ----
function setTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  $("#theme").textContent = t === "dark" ? "Light" : "Dark";
  try { localStorage.setItem("pn-theme", t); } catch (e) {}
}

let saved = null;
try { saved = localStorage.getItem("pn-theme"); } catch (e) {}
setTheme(saved || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"));
$("#theme").onclick = () => setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");

// ---- FACTS CAROUSEL (vertical 3D flip) ----
(function () {
  const track    = document.getElementById("facts-track");
  const dotsWrap = document.getElementById("facts-dots");
  const prevBtn  = document.getElementById("facts-prev");
  const nextBtn  = document.getElementById("facts-next");

  if (!track) return;

  const slides  = Array.from(track.children);
  const total   = slides.length;
  let current   = 0;
  let animating = false;
  let timer     = null;
  const ANIM_MS = 480; // must match CSS animation duration

  // Build dot indicators
  slides.forEach((_, i) => {
    const d = document.createElement("button");
    d.className = "facts-dot" + (i === 0 ? " active" : "");
    d.setAttribute("aria-label", "Go to fact " + (i + 1));
    d.addEventListener("click", () => goTo(i, i > current ? 1 : -1));
    dotsWrap.appendChild(d);
  });

  // Activate first slide
  slides[0].classList.add("f-active");

  function getDots() { return Array.from(dotsWrap.children); }

  function goTo(nextIdx, direction) {
    if (animating) return;
    nextIdx = ((nextIdx % total) + total) % total;
    if (nextIdx === current) return;
    animating = true;
    clearTimeout(timer);

    const outSlide = slides[current];
    const inSlide  = slides[nextIdx];
    const fwd      = direction === 1;

    // Exit current card
    outSlide.classList.remove("f-active");
    outSlide.classList.add(fwd ? "f-exit-up" : "f-exit-down");

    // Enter next card (slight stagger so they don't fight)
    setTimeout(() => {
      inSlide.classList.add(fwd ? "f-enter-up" : "f-enter-down");
    }, 60);

    // Clean up after animation
    setTimeout(() => {
      outSlide.classList.remove("f-exit-up", "f-exit-down");
      inSlide.classList.remove("f-enter-up", "f-enter-down");
      inSlide.classList.add("f-active");
      current   = nextIdx;
      animating = false;
      getDots().forEach((d, i) => d.classList.toggle("active", i === current));
      timer = setTimeout(advance, 10000);
    }, ANIM_MS + 70);
  }

  function advance() { goTo(current + 1, 1); }

  prevBtn.addEventListener("click", () => goTo(current - 1, -1));
  nextBtn.addEventListener("click", () => goTo(current + 1,  1));

  // Vertical swipe support on mobile
  let touchStartY = 0;
  track.addEventListener("touchstart", e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  track.addEventListener("touchend", e => {
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dy) > 40) goTo(current + (dy < 0 ? 1 : -1), dy < 0 ? 1 : -1);
  });

  // Pause auto-advance on hover, resume on leave
  const panel = track.closest("aside");
  if (panel) {
    panel.addEventListener("mouseenter", () => clearTimeout(timer));
    panel.addEventListener("mouseleave", () => { timer = setTimeout(advance, 10000); });
  }

  // Kick off auto-advance
  timer = setTimeout(advance, 10000);
})();

// ---- INIT ----
loadNotes();
preview();
route();
