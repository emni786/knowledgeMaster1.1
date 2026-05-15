const $ = (id) => document.getElementById(id);

function normalizeAppUrl(raw) {
  const trimmed = (raw ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function init() {
  const { token, apiUrl } = await chrome.storage.local.get(["token", "apiUrl"]);
  const normalized = normalizeAppUrl(apiUrl);
  if (!token || !normalized) {
    $("setup").style.display = "block";
    if (normalized) $("apiUrl").value = normalized;
    if (token) $("token").value = token;
    if (normalized) $("settingsHint").innerHTML = `<a href="${normalized}/settings" target="_blank">Settings</a>`;
    $("saveSetup").addEventListener("click", saveSetup);
    return;
  }
  $("main").style.display = "block";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("url").textContent = tab?.url ?? "";
  $("save").addEventListener("click", () => save(tab, normalized, token));
  $("reset").addEventListener("click", async () => {
    await chrome.storage.local.remove(["token", "apiUrl"]);
    location.reload();
  });
}

async function saveSetup() {
  const apiUrl = normalizeAppUrl($("apiUrl").value);
  const token = $("token").value.trim();
  if (!apiUrl) {
    setStatus("Enter a valid app URL (https://...).", "err");
    return;
  }
  if (!token) {
    setStatus("Enter an API token.", "err");
    return;
  }
  await chrome.storage.local.set({ apiUrl, token });
  location.reload();
}

async function save(tab, apiUrl, token) {
  const url = tab?.url;
  if (!url || !/^https?:/.test(url)) {
    setStatus("Cannot save this page.", "err");
    return;
  }
  $("save").disabled = true;
  setStatus("Saving…");
  try {
    const res = await fetch(`${apiUrl}/api/public/extension/save`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ url, title: tab.title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error ?? `Error ${res.status}`, "err");
      $("save").disabled = false;
      return;
    }
    setStatus(data.duplicate ? "Already in your library." : "Saved to library", "ok");
    setTimeout(() => window.close(), 900);
  } catch (e) {
    setStatus(e.message ?? "Network error", "err");
    $("save").disabled = false;
  }
}

function setStatus(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + cls;
}

init();
