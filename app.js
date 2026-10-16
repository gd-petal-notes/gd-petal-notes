// ============================================================
//  Petal Notes — App Logic
//  GDC · Graphic Design Club · Breast Cancer Awareness
// ============================================================

// ---- MOCK DATA: replace with Supabase select from a `notes` table ----
let notes = [
  {
    id: 1,
    topic: "You are not alone",
    author: "Maya",
    body: "I wanted to write this for whoever is reading it right now. There will be days when everything feels heavy, and that is okay. You do not have to be brave every single minute. Rest when you need to, cry when you need to, and know that so many people are thinking of you and cheering for you, even strangers like me.\n\nTake it one small step at a time. Today, just getting through is enough."
  },
  {
    id: 2,
    topic: "Soft days are allowed",
    author: "Anonymous",
    body: "Some days you will feel strong and some days you will just want a blanket and tea. Both are valid. Being gentle with yourself is not giving up, it is part of healing."
  },
  {
    id: 3,
    topic: "My mother's strength",
    author: "Sara",
    body: "My mum went through this and she taught me that courage is quiet. It looks like showing up to appointments, laughing at silly shows, and letting people help. She is healthy today, and she asks me to tell everyone: hope is real. Please hold on to it, even when it flickers. Your story is still being written and it has so many good pages left."
  },
  {
    id: 4,
    topic: "Thinking of you",
    author: "GDC Member",
    body: "Just a little pink hug from us."
  },
  {
    id: 5,
    topic: "A letter to the fighter",
    author: "Noor",
    body: "Dear fighter, you are more than a diagnosis. You are a daughter, a friend, a dreamer, a person with a whole life full of colour. I hope today brings you one small joy: a good song, a warm drink, a message from someone who loves you. We believe in you. We are in your corner, always."
  },
  {
    id: 6,
    topic: "Check in, check up",
    author: "Anonymous",
    body: "A reminder to everyone reading: be kind to yourself, and please do not skip your check-ups. Early awareness saves lives. And to anyone going through treatment, you are admired more than you know."
  }
];

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
$("#send").onclick = () => {
  const t = $("#topic").value.trim(), m = $("#msg").value.trim();
  if (!t || !m) return toast("Please add a topic and a message");
  if (words(m).length > 500) return toast("Please keep it under 500 words");
  // ---- Replace with Supabase insert into `notes` (approved:false until moderated) ----
  notes.unshift({ id: Date.now(), topic: t, body: m, author: $("#nm").value.trim() || "Anonymous" });
  renderWall();
  ["#topic", "#msg", "#nm"].forEach(s => $(s).value = "");
  preview();
  toast("Thank you! Your note is on its way.");
  location.hash = "#/home";
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
renderWall();
preview();
route();
