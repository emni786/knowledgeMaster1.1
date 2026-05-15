const API = "https://knowledgemaster.lovable.app/api/public/extension/save";

const $ = (id) => document.getElementById(id);

async function init() {
  const { token } = await chrome.storage.local.get("token");
  if (!token) {
    $("setup").style.display = "block";
    $("saveToken").addEventListener("click", saveToken);
    return;
  }
  $("main").style.display = "block";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("url").textContent = tab?.url ?? "";
  $("save").addEventListener("click", () => save(tab));
  $("reset").addEventListener("click", async () => {
    await chrome.storage.local.remove("token");
    location.reload();
  });
}

async function saveToken() {
  const v = $("token").value.trim();
  if (!v) return;
  await chrome.storage.local.set({ token: v });
  location.reload();
}

async function save(tab) {
  const url = tab?.url;
  if (!url || !/^https?:/.test(url)) {
    setStatus("Cannot save this page.", "err");
    return;
  }
  $("save").disabled = true;
  setStatus("Saving…");
  try {
    const { token } = await chrome.storage.local.get("token");
    const res = await fetch(API, {
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
    setStatus(data.duplicate ? "Already in your library." : "Saved to library ✓", "ok");
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
