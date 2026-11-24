/* Campus Attendance - vanilla JS single page app. Talks to the FastAPI REST API. */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const modal = $("#modal");
let token = localStorage.getItem("token") || "";
let timer = null; // auto-refresh interval of the current page

/* ------------------------------------------------------------ helpers */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.textContent = msg;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), bad ? 6000 : 3000);
}

async function api(path, { method = "GET", body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch("/api" + path, { method, headers, body: payload });
  if (res.status === 401 && !path.startsWith("/auth/login")) { logout(); throw new Error("Please sign in again"); }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail
        : Array.isArray(j.detail) ? j.detail.map((d) => `${(d.loc || []).slice(1).join(".")}: ${d.msg}`).join("; ") : msg;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  return raw ? res : res.json();
}

const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-");
const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-");
const ago = (m) => (m == null ? "" : m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min ago` : `${Math.floor(m / 1440)} d ago`);
const pill = (s) => `<span class="pill ${esc(String(s).toLowerCase())}">${esc(s)}</span>`;
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function openModal(html) {
  modal.innerHTML = `<div class="modal-body">${html}</div>`;
  if (!modal.open) modal.showModal();
  const first = modal.querySelector("input:not([type=checkbox]),select");
  if (first) first.focus();
}
const closeModal = () => modal.open && modal.close();
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}

function confirmBox(message, okLabel = "Delete") {
  return new Promise((resolve) => {
    openModal(`<h2>${esc(message)}</h2><div class="modal-foot">
      <button class="btn" data-x="0">Cancel</button><button class="btn danger" data-x="1">${esc(okLabel)}</button></div>`);
    modal.querySelectorAll("[data-x]").forEach((b) => b.onclick = () => { closeModal(); resolve(b.dataset.x === "1"); });
  });
}

/* ------------------------------------------------------------ auth */
function showLogin() {
  $("#app").hidden = true; $("#login-screen").hidden = false;
}
function logout() {
  token = ""; localStorage.removeItem("token"); clearInterval(timer); showLogin();
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $("#login-error").textContent = "";
  try {
    const r = await api("/auth/login", { method: "POST", body: { username: f.get("username"), password: f.get("password") } });
    token = r.access_token; localStorage.setItem("token", token);
    e.target.reset(); startApp(r.username);
  } catch (err) { $("#login-error").textContent = err.message; }
});
$("#btn-logout").onclick = logout;
$("#btn-password").onclick = () => {
  openModal(`<h2>Change password</h2>
    <form id="pw-form"><label>Current password<input type="password" name="current" required autocomplete="current-password"></label>
    <label>New password (8+ characters)<input type="password" name="next" minlength="8" required autocomplete="new-password"></label>
    <div class="modal-foot"><button type="button" class="btn" onclick="modal.close()">Cancel</button><button class="btn primary">Save password</button></div></form>`);
  $("#pw-form").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target);
    busy(e.submitter, async () => { await api("/auth/change-password", { method: "POST", body: { current_password: f.get("current"), new_password: f.get("next") } }); closeModal(); toast("Password changed"); }); };
};

async function startApp(username) {
  $("#login-screen").hidden = true; $("#app").hidden = false;
  $("#whoami").textContent = username || "";
  if (!username) { try { $("#whoami").textContent = (await api("/auth/me")).username; } catch (_) { return; } }
  route();
}

/* ------------------------------------------------------------ router */
const pages = { dashboard, attendance, find, review, students, timetable, cameras };
function route() {
  clearInterval(timer); timer = null;
  const name = (location.hash.replace("#/", "") || "dashboard").split("?")[0];
  const page = pages[name] || dashboard;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#/" + name));
  view.innerHTML = '<p class="muted">Loading…</p>';
  page().catch((e) => { view.innerHTML = `<div class="banner bad">${esc(e.message)}</div>`; });
  view.focus({ preventScroll: true });
  refreshBadge();
}
window.addEventListener("hashchange", route);
async function refreshBadge() {
  try { const items = await api("/review?status=pending&limit=200"); const b = $("#review-badge"); b.hidden = !items.length; b.textContent = items.length; } catch (_) { /* ignore */ }
}
function autoRefresh(fn, ms) { clearInterval(timer); timer = setInterval(() => fn().catch(() => {}), ms); }

/* ------------------------------------------------------------ dashboard */
async function dashboard() {
  const draw = async () => {
    const s = await api("/stats");
    let banner = "";
    if (s.face_engine_error) banner = `<div class="banner bad"><b>Face engine failed to load.</b> ${esc(s.face_engine_error)}</div>`;
    else if (!s.face_engine_ready) banner = `<div class="banner">Face engine is loading. The first start downloads the AI model (about 280 MB), so it can take a few minutes. Enrolment and recognition start working once it finishes.</div>`;
    const sessions = s.active_sessions.length
      ? s.active_sessions.map((a) => {
          const start = new Date(a.started_at).getTime(), end = new Date(a.ends_at).getTime();
          const pct = Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
          return `<div class="live"><span class="dot"></span><div class="grow"><b>${esc(a.class_name)}</b>
            <span class="muted"> · camera ${esc(a.camera_id)} · until ${fmtClock(a.ends_at)}</span>
            <div class="bar"><i style="width:${pct}%"></i></div></div>
            <div><b>${a.present}</b><span class="muted"> / ${a.enrolled} present</span></div>
            <button class="btn small" data-stop="${esc(a.class_id)}">Stop</button></div>`;
        }).join("")
      : `<p class="muted">No class is being recorded right now. Sessions start by themselves at class time, or you can start one from the Timetable page.</p>`;
    const streams = Object.entries(s.streams).map(([id, st]) =>
      `<tr><td>${esc(id)}</td><td>${st.connected ? pill("Present").replace("Present", "Connected") : `<span class="pill absent">Offline</span>`}</td><td class="muted">${esc(st.error)}</td></tr>`).join("");
    view.innerHTML = `
      <div class="page-head"><div><h1>Dashboard</h1><p class="muted">Today, ${esc(s.today.date)}</p></div></div>
      ${banner}
      <div class="stats">
        <div class="stat"><b>${s.today.present}</b><span>Present today</span></div>
        <div class="stat"><b>${s.today.review}</b><span>Waiting for review</span></div>
        <div class="stat"><b>${s.today.absent}</b><span>Absent today</span></div>
        <div class="stat"><b>${s.enrolled_faces}</b><span>Enrolled faces</span></div>
        <div class="stat"><b>${s.classes}</b><span>Classes</span></div>
        <div class="stat"><b>${s.cameras}</b><span>Cameras</span></div>
      </div>
      ${s.pending_reviews ? `<div class="banner">${s.pending_reviews} face${s.pending_reviews > 1 ? "s" : ""} need a human check. <a href="#/review">Open the review queue</a></div>` : ""}
      <div class="panel"><h2>Recording now</h2>${sessions}</div>
      <div class="panel"><h2>Camera connections</h2>${streams ? `<div class="table-wrap"><table><tbody>${streams}</tbody></table></div>` : `<p class="muted">Cameras connect when a class starts or when a hallway camera is tracked.</p>`}
        <p class="muted">Location tracking is running on: ${s.tracking_cameras.length ? s.tracking_cameras.map(esc).join(", ") : "no hallway cameras"}.</p></div>`;
    view.querySelectorAll("[data-stop]").forEach((b) => b.onclick = () => busy(b, async () => { await api(`/sessions/${encodeURIComponent(b.dataset.stop)}/stop`, { method: "POST" }); toast("Session stopped"); draw(); }));
  };
  await draw(); autoRefresh(draw, 5000);
}

/* ------------------------------------------------------------ attendance */
async function attendance() {
  const classes = await api("/timetable");
  const state = { date: todayISO(), class_id: "", status: "" };
  const qs = () => new URLSearchParams(Object.entries(state).filter(([, v]) => v)).toString();
  view.innerHTML = `
    <div class="page-head"><div><h1>Attendance</h1><p class="muted">Marked automatically from the cameras. You can correct any row.</p></div>
      <button class="btn" id="csv">Download CSV</button></div>
    <div class="panel row">
      <label class="grow">Date<input type="date" id="f-date" value="${state.date}"></label>
      <label class="grow">Class<select id="f-class"><option value="">All classes</option>${classes.map((c) => `<option value="${esc(c.class_id)}">${esc(c.name)} (${esc(c.class_id)})</option>`).join("")}</select></label>
      <label class="grow">Status<select id="f-status"><option value="">All</option><option>Present</option><option>Review</option><option>Absent</option></select></label>
    </div><div id="att-table"></div>`;
  const load = async () => {
    const rows = await api("/attendance?" + qs());
    const counts = rows.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
    $("#att-table").innerHTML = rows.length ? `
      <p class="muted">${rows.length} records · ${counts.Present || 0} present · ${counts.Review || 0} to review · ${counts.Absent || 0} absent</p>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Status</th><th>How</th><th>Time</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><b>${esc(r.student_name)}</b><br><span class="muted">${esc(r.student_id)}</span></td>
        <td>${esc(r.class_name)}<br><span class="muted">${esc(r.class_id)}</span></td><td>${pill(r.status)}</td>
        <td>${esc(({ auto: "Camera", manual: "Manual", manual_review: "Reviewed" })[r.method] || r.method || "")}${r.confidence ? `<br><span class="muted">match ${(r.confidence * 100).toFixed(0)}%</span>` : ""}</td>
        <td>${fmtClock(r.marked_at)}</td>
        <td class="actions"><button class="btn small" data-m="Present" data-s="${esc(r.student_id)}" data-c="${esc(r.class_id)}">Mark present</button>
          <button class="btn small" data-m="Absent" data-s="${esc(r.student_id)}" data-c="${esc(r.class_id)}">Mark absent</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="panel empty">No attendance records for these filters yet.</div>`;
    $("#att-table").querySelectorAll("[data-m]").forEach((b) => b.onclick = () => busy(b, async () => {
      await api("/attendance", { method: "PUT", body: { student_id: b.dataset.s, class_id: b.dataset.c, date: state.date, status: b.dataset.m } });
      toast("Updated"); load();
    }));
  };
  $("#f-date").onchange = (e) => { state.date = e.target.value || todayISO(); load(); };
  $("#f-class").onchange = (e) => { state.class_id = e.target.value; load(); };
  $("#f-status").onchange = (e) => { state.status = e.target.value; load(); };
  $("#csv").onclick = (e) => busy(e.target, async () => {
    const res = await api("/attendance/export.csv?" + qs(), { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `attendance_${state.date}.csv` });
    a.click(); URL.revokeObjectURL(url);
  });
  await load();
}

/* ------------------------------------------------------------ find a person */
async function find() {
  view.innerHTML = `<div class="page-head"><div><h1>Find a person</h1><p class="muted">Shows the last camera that recognised them. This is not a live video feed.</p></div></div>
    <div class="panel"><input id="q" type="search" placeholder="Type a name or ID" autocomplete="off"></div><div id="results"></div>`;
  let seq = 0;
  const run = async () => {
    const my = ++seq;
    const rows = await api("/locations/search?q=" + encodeURIComponent($("#q").value));
    if (my !== seq) return;
    $("#results").innerHTML = rows.length ? `<div class="table-wrap">${rows.map((r) => `
      <div class="person"><div><b>${esc(r.name)}</b> <span class="muted">${esc(r.student_id)}${r.role ? " · " + esc(r.role) : ""}</span></div>
      ${r.last_camera_id ? `<div><div class="where">${esc(r.camera_name || r.last_camera_id)}</div><span class="muted">${fmtTime(r.timestamp)} · ${ago(r.minutes_ago)}</span></div>`
        : `<span class="muted">Not seen by any camera yet</span>`}</div>`).join("")}</div>`
      : `<div class="panel empty">${$("#q").value ? "Nobody matches that search." : "Nobody has been seen yet. Locations appear once cameras recognise enrolled people."}</div>`;
  };
  let t; $("#q").oninput = () => { clearTimeout(t); t = setTimeout(() => run().catch((e) => toast(e.message, true)), 250); };
  await run(); autoRefresh(run, 15000);
}

/* ------------------------------------------------------------ review queue */
async function review() {
  const [items, users] = await Promise.all([api("/review?status=pending"), api("/users")]);
  const options = users.map((u) => `<option value="${esc(u.student_id)}">${esc(u.name)} (${esc(u.student_id)})</option>`).join("");
  view.innerHTML = `<div class="page-head"><div><h1>Review queue</h1>
    <p class="muted">The camera saw a face that looked like someone, but not clearly enough to be sure. Confirm who it is, or reject it.</p></div></div>
    ${items.length ? `<div class="cards">${items.map((i) => `
      <div class="card" data-id="${esc(i.id)}">
        <img alt="Cropped face from camera ${esc(i.camera_id)}" src="data:image/jpeg;base64,${esc(i.image_base64_crop)}">
        <div><b>${esc(i.suggested_name || "Unknown")}</b> <span class="muted">${esc(i.suggested_student_id || "")}</span><br>
          <span class="muted">${(i.score * 100).toFixed(0)}% similar · ${esc(i.camera_id)}${i.class_id ? " · " + esc(i.class_id) : ""}<br>${fmtTime(i.timestamp)}</span></div>
        <label>Who is this?<select>${`<option value="${esc(i.suggested_student_id || "")}">${i.suggested_student_id ? "Suggested match" : "Choose…"}</option>` + options}</select></label>
        <div class="row"><button class="btn primary small" data-a="approve">Confirm</button><button class="btn danger small" data-a="reject">Not them</button></div>
      </div>`).join("")}</div>` : `<div class="panel empty">Nothing to review. Faces that need a human check will show up here.</div>`}`;
  view.querySelectorAll(".card").forEach((card) => card.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => busy(b, async () => {
    await api(`/review/${card.dataset.id}/resolve`, { method: "POST", body: { action: b.dataset.a, student_id: $("select", card).value || null } });
    card.remove(); toast(b.dataset.a === "approve" ? "Confirmed" : "Rejected"); refreshBadge();
    if (!view.querySelector(".card")) review();
  })));
}

/* ------------------------------------------------------------ people */
async function students() {
  view.innerHTML = `<div class="page-head"><div><h1>People</h1><p class="muted">Upload one clear ID photo per person. Only the face data is kept, never the photo.</p></div>
    <button class="btn primary" id="add">Enrol a person</button></div>
    <div class="panel"><input id="q" type="search" placeholder="Search by name or ID"></div><div id="list"></div>`;
  const load = async () => {
    const rows = await api("/users?q=" + encodeURIComponent($("#q").value));
    $("#list").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Department</th><th>Face data</th><th></th></tr></thead><tbody>
      ${rows.map((u) => `<tr><td>${esc(u.student_id)}</td><td><b>${esc(u.name)}</b></td><td>${esc(u.role)}</td><td>${esc(u.department)}</td>
        <td>${u.has_face ? '<span class="pill present">Enrolled</span>' : '<span class="pill absent">Missing</span>'}</td>
        <td class="actions"><button class="btn small" data-edit="${esc(u.student_id)}">Edit</button> <button class="btn small danger" data-del="${esc(u.student_id)}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="panel empty">No people yet. Use “Enrol a person” to add the first one.</div>`;
    $("#list").querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => personForm(rows.find((r) => r.student_id === b.dataset.edit)));
    $("#list").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!(await confirmBox(`Delete ${b.dataset.del} and their face data?`))) return;
      busy(b, async () => { await api("/users/" + encodeURIComponent(b.dataset.del), { method: "DELETE" }); toast("Deleted"); load(); });
    });
  };
  function personForm(u) {
    const edit = !!u;
    openModal(`<h2>${edit ? "Edit " + esc(u.name) : "Enrol a person"}</h2>
      <form id="pf"><div class="two"><label>ID<input name="student_id" required ${edit ? `value="${esc(u.student_id)}" readonly` : ""} placeholder="e.g. CS2024001"></label>
      <label>Role<select name="role"><option value="student" ${u?.role === "student" ? "selected" : ""}>Student</option><option value="staff" ${u?.role === "staff" ? "selected" : ""}>Staff</option></select></label></div>
      <label>Full name<input name="name" required value="${esc(u?.name || "")}"></label>
      <label>Department<input name="department" value="${esc(u?.department || "")}"></label>
      <label>${edit ? "Replace photo (optional)" : "ID photo"}<input type="file" name="photo" accept="image/jpeg,image/png" ${edit ? "" : "required"}></label>
      <img class="preview" id="prev" alt="" hidden>
      <label style="font-weight:400"><input type="checkbox" name="force" value="true"> Enrol anyway if this face looks like someone already enrolled</label>
      <div class="modal-foot"><button type="button" class="btn" onclick="modal.close()">Cancel</button><button class="btn primary">${edit ? "Save changes" : "Enrol person"}</button></div></form>`);
    $("#pf input[name=photo]").onchange = (e) => { const f = e.target.files[0]; const p = $("#prev"); if (f) { p.src = URL.createObjectURL(f); p.hidden = false; } else p.hidden = true; };
    $("#pf").onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target);
      if (!fd.get("force")) fd.delete("force");
      if (edit && !fd.get("photo").size) fd.delete("photo");
      busy(e.submitter, async () => {
        await api(edit ? "/users/" + encodeURIComponent(u.student_id) : "/users", { method: edit ? "PUT" : "POST", form: fd });
        closeModal(); toast(edit ? "Saved" : "Enrolled"); load();
      }); };
  }
  $("#add").onclick = () => personForm(null);
  let t; $("#q").oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  await load();
}

/* ------------------------------------------------------------ cameras */
async function cameras() {
  view.innerHTML = `<div class="page-head"><div><h1>Cameras</h1><p class="muted">Classroom cameras record attendance. Hallway cameras track where people were last seen.</p></div>
    <button class="btn primary" id="add">Add camera</button></div><div id="list"></div>`;
  const load = async () => {
    const rows = await api("/cameras");
    $("#list").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Address</th><th>State</th><th></th></tr></thead><tbody>
      ${rows.map((c) => `<tr><td>${esc(c.camera_id)}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.type)}</td>
        <td class="muted" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(c.source.replace(/\/\/[^@/]*@/, "//***@"))}">${esc(c.source.replace(/\/\/[^@/]*@/, "//***@"))}</td>
        <td>${c.enabled ? (c.stream ? (c.stream.connected ? '<span class="pill present">Connected</span>' : '<span class="pill absent">Offline</span>') : '<span class="pill neutral">Idle</span>') : '<span class="pill neutral">Disabled</span>'}</td>
        <td class="actions"><button class="btn small" data-test="${esc(c.camera_id)}">Test</button> <button class="btn small" data-edit="${esc(c.camera_id)}">Edit</button> <button class="btn small danger" data-del="${esc(c.camera_id)}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="panel empty">No cameras yet. Add the RTSP address of a CCTV camera to begin.</div>`;
    $("#list").querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => camForm(rows.find((r) => r.camera_id === b.dataset.edit)));
    $("#list").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!(await confirmBox(`Delete camera ${b.dataset.del}?`))) return;
      busy(b, async () => { await api("/cameras/" + encodeURIComponent(b.dataset.del), { method: "DELETE" }); toast("Deleted"); load(); });
    });
    $("#list").querySelectorAll("[data-test]").forEach((b) => b.onclick = () => busy(b, async () => {
      toast("Connecting to camera…");
      const res = await api(`/cameras/${encodeURIComponent(b.dataset.test)}/snapshot`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      openModal(`<h2>Camera ${esc(b.dataset.test)}</h2><img class="preview" style="width:100%;max-height:none" src="${url}" alt="Camera snapshot"><div class="modal-foot"><button class="btn" onclick="modal.close()">Close</button></div>`);
    }));
  };
  function camForm(c) {
    const edit = !!c;
    openModal(`<h2>${edit ? "Edit camera" : "Add camera"}</h2><form id="cf">
      <div class="two"><label>Camera ID<input name="camera_id" required pattern="[A-Za-z0-9_\\-]+" value="${esc(c?.camera_id || "")}" ${edit ? "readonly" : ""} placeholder="room4"></label>
      <label>Name<input name="name" required value="${esc(c?.name || "")}" placeholder="Room 4 front camera"></label></div>
      <label>Address<input name="source" required value="${esc(c?.source || "")}" placeholder="rtsp://user:password@192.168.1.50:554/stream1"></label>
      <p class="muted" style="margin-top:-.4rem">You can also enter 0 for a USB webcam, or the path of a video file for testing.</p>
      <div class="two"><label>Type<select name="type"><option value="classroom" ${c?.type === "classroom" ? "selected" : ""}>Classroom (attendance)</option><option value="hallway" ${c?.type === "hallway" ? "selected" : ""}>Hallway (location tracking)</option></select></label>
      <label>State<select name="enabled"><option value="true" ${c?.enabled !== false ? "selected" : ""}>Enabled</option><option value="false" ${c?.enabled === false ? "selected" : ""}>Disabled</option></select></label></div>
      <div class="modal-foot"><button type="button" class="btn" onclick="modal.close()">Cancel</button><button class="btn primary">${edit ? "Save changes" : "Add camera"}</button></div></form>`);
    $("#cf").onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.enabled = f.enabled === "true";
      busy(e.submitter, async () => { await api(edit ? "/cameras/" + encodeURIComponent(c.camera_id) : "/cameras", { method: edit ? "PUT" : "POST", body: f }); closeModal(); toast("Saved"); load(); }); };
  }
  $("#add").onclick = () => camForm(null);
  await load(); autoRefresh(load, 8000);
}

/* ---------------------------------------------------------- timetable */
async function timetable() {
  view.innerHTML = `<div class="page-head"><div><h1>Timetable</h1><p class="muted">Attendance starts automatically at the class start time and runs for the first few minutes of the lecture.</p></div>
    <button class="btn primary" id="add">Add class</button></div><div id="list"></div>`;
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const load = async () => {
    const rows = await api("/timetable");
    $("#list").innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Class</th><th>Days</th><th>Time</th><th>Camera</th><th>Students</th><th></th></tr></thead><tbody>
      ${rows.map((c) => `<tr><td><b>${esc(c.name)}</b><br><span class="muted">${esc(c.class_id)}</span></td><td>${c.days.map(esc).join(", ")}</td><td>${esc(c.start_time)}–${esc(c.end_time)}</td>
        <td>${esc(c.room_camera_id)}</td><td>${c.enrolled_students.length}</td>
        <td class="actions"><button class="btn small" data-run="${esc(c.class_id)}">Take attendance now</button> <button class="btn small" data-edit="${esc(c.class_id)}">Edit</button> <button class="btn small danger" data-del="${esc(c.class_id)}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="panel empty">No classes yet. Add a camera and some people first, then add a class.</div>`;
    $("#list").querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => classForm(rows.find((r) => r.class_id === b.dataset.edit)));
    $("#list").querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => {
      if (!(await confirmBox(`Delete class ${b.dataset.del}?`))) return;
      busy(b, async () => { await api("/timetable/" + encodeURIComponent(b.dataset.del), { method: "DELETE" }); toast("Deleted"); load(); });
    });
    $("#list").querySelectorAll("[data-run]").forEach((b) => b.onclick = () => busy(b, async () => {
      await api("/sessions/start", { method: "POST", body: { class_id: b.dataset.run } });
      toast("Attendance is running. Watch it on the Dashboard.");
    }));
  };
  async function classForm(c) {
    const edit = !!c;
    const [cams, users] = await Promise.all([api("/cameras"), api("/users?role=student")]);
    const chosen = new Set(c?.enrolled_students || []);
    openModal(`<h2>${edit ? "Edit class" : "Add class"}</h2><form id="tf">
      <div class="two"><label>Class ID<input name="class_id" required pattern="[A-Za-z0-9_\\-]+" value="${esc(c?.class_id || "")}" ${edit ? "readonly" : ""} placeholder="CS101-A"></label>
      <label>Name<input name="name" required value="${esc(c?.name || "")}" placeholder="Computer Science 101"></label></div>
      <label>Room camera<select name="room_camera_id" required>${cams.map((k) => `<option value="${esc(k.camera_id)}" ${c?.room_camera_id === k.camera_id ? "selected" : ""}>${esc(k.name)} (${esc(k.camera_id)})</option>`).join("")}</select></label>
      <div class="two"><label>Starts<input type="time" name="start_time" required value="${esc(c?.start_time || "09:00")}"></label><label>Ends<input type="time" name="end_time" required value="${esc(c?.end_time || "10:00")}"></label></div>
      <div class="daygrid">${DAYS.map((d) => `<label><input type="checkbox" name="days" value="${d}" ${c?.days?.includes(d) ? "checked" : ""}>${d}</label>`).join("")}</div>
      <label>Students in this class <span class="muted" id="cnt"></span></label>
      <div class="row" style="margin-bottom:.4rem"><input id="sf" class="grow" type="search" placeholder="Filter list"><button type="button" class="btn small" id="sall">Select shown</button><button type="button" class="btn small" id="snone">Clear</button></div>
      <div class="picklist" id="pl">${users.map((u) => `<label data-t="${esc((u.name + " " + u.student_id).toLowerCase())}"><input type="checkbox" value="${esc(u.student_id)}" ${chosen.has(u.student_id) ? "checked" : ""}>${esc(u.name)} <span class="muted">${esc(u.student_id)}</span></label>`).join("") || '<p class="muted">Enrol students first.</p>'}</div>
      <div class="modal-foot"><button type="button" class="btn" onclick="modal.close()">Cancel</button><button class="btn primary">${edit ? "Save changes" : "Add class"}</button></div></form>`);
    if (!cams.length) { closeModal(); toast("Add a camera first", true); return; }
    const boxes = () => [...$("#pl").querySelectorAll("input")];
    const count = () => $("#cnt").textContent = `(${boxes().filter((b) => b.checked).length} selected)`;
    $("#pl").onchange = count; count();
    $("#sf").oninput = (e) => { const q = e.target.value.toLowerCase(); $("#pl").querySelectorAll("label").forEach((l) => l.hidden = !l.dataset.t.includes(q)); };
    $("#sall").onclick = () => { $("#pl").querySelectorAll("label:not([hidden]) input").forEach((b) => b.checked = true); count(); };
    $("#snone").onclick = () => { boxes().forEach((b) => b.checked = false); count(); };
    $("#tf").onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target);
      const body = { class_id: f.get("class_id"), name: f.get("name"), room_camera_id: f.get("room_camera_id"), start_time: f.get("start_time"), end_time: f.get("end_time"),
        days: f.getAll("days"), enrolled_students: boxes().filter((b) => b.checked).map((b) => b.value) };
      if (!body.days.length) return toast("Pick at least one day", true);
      busy(e.submitter, async () => { await api(edit ? "/timetable/" + encodeURIComponent(c.class_id) : "/timetable", { method: edit ? "PUT" : "POST", body }); closeModal(); toast("Saved"); load(); }); };
  }
  $("#add").onclick = () => classForm(null).catch((e) => toast(e.message, true));
  await load();
}

/* ------------------------------------------------------------ boot */
(async function boot() {
  if (!token) return showLogin();
  startApp();
})();