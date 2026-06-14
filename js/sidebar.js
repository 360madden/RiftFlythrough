// Sidebar controls and action wiring.

const SIDEBAR_COLLAPSED_KEY = "rift-sb-cl";
const SIDEBAR_SECTIONS_KEY = "rift-sb-sections";
const SIDEBAR_TOGGLE_PREFIX = "rift-sb-";
const SETTINGS_KEY = "rift-flythrough-settings";

function withStorage(callback) {
  try {
    return callback();
  } catch (_error) {
    return undefined;
  }
}

function setDisplay(id, visible, visibleDisplay = "") {
  const element = document.getElementById(id);
  if (element) element.style.display = visible ? visibleDisplay : "none";
}

function toggleKeyFromId(id) {
  return id.replace("sb-toggle-", "");
}

function setStoredToggle(key, enabled) {
  withStorage(() => localStorage.setItem(`${SIDEBAR_TOGGLE_PREFIX}${key}`, enabled ? "1" : "0"));
}

function readStoredToggle(key) {
  return withStorage(() => localStorage.getItem(`${SIDEBAR_TOGGLE_PREFIX}${key}`));
}

function setSidebarDot(id, enabled, persist = true) {
  const element = document.getElementById(id);
  if (!element) return;

  const dot = element.querySelector(".sb-dot");
  if (!dot) return;

  dot.classList.toggle("on", enabled);
  dot.classList.toggle("off", !enabled);

  if (persist) setStoredToggle(toggleKeyFromId(id), enabled);
}

function saveSettingValue(key, value) {
  withStorage(() => {
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (!settings.visualProfile) settings.visualProfile = "beauty";
    settings[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  });
}

function persistSectionStates() {
  withStorage(() => {
    const state = {};
    const sections = document.querySelectorAll("#sidebar .sb-section");
    for (let i = 0; i < sections.length; i++) {
      const key = sections[i].getAttribute("data-section") || `section${i}`;
      state[key] = sections[i].classList.contains("open");
    }
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(state));
  });
}

function restoreSectionStates() {
  withStorage(() => {
    const saved = JSON.parse(localStorage.getItem(SIDEBAR_SECTIONS_KEY) || "{}");
    const sections = document.querySelectorAll("#sidebar .sb-section");
    for (let i = 0; i < sections.length; i++) {
      const key = sections[i].getAttribute("data-section") || `section${i}`;
      if (saved[key] === false) sections[i].classList.remove("open");
    }
  });
}

function wireSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  if (!sidebar || !toggle) return;

  let collapsed = false;
  const applyCollapsed = (nextCollapsed) => {
    collapsed = nextCollapsed;
    sidebar.classList.toggle("collapsed", collapsed);
    toggle.textContent = collapsed ? "▶" : "☰";
    toggle.title = collapsed ? "Show menu" : "Hide menu";
  };

  toggle.addEventListener("click", () => {
    applyCollapsed(!collapsed);
    withStorage(() => localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0"));
  });

  withStorage(() => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") applyCollapsed(true);
  });
}

function wireSectionHeaders() {
  const headers = document.querySelectorAll(".sb-header");
  for (let i = 0; i < headers.length; i++) {
    headers[i].addEventListener("click", function onHeaderClick() {
      const section = this.parentElement;
      if (!section) return;
      section.classList.toggle("open");
      persistSectionStates();
    });
  }
  restoreSectionStates();
}

function wireToggle(id, key, onChange) {
  const element = document.getElementById(id);
  if (!element) return;

  const dot = element.querySelector(".sb-dot");
  if (!dot) return;

  element.addEventListener("click", () => {
    const nextEnabled = !dot.classList.contains("on");
    setSidebarDot(id, nextEnabled, false);
    setStoredToggle(key, nextEnabled);
    if (onChange) onChange(nextEnabled);
  });

  const stored = readStoredToggle(key);
  if (stored === "0") setSidebarDot(id, false, false);
  if (stored === "1") setSidebarDot(id, true, false);
}

function applyWireframeToWorld(enabled) {
  if (!Array.isArray(window.worldGroups)) return;

  for (let i = 0; i < window.worldGroups.length; i++) {
    window.worldGroups[i].traverse((child) => {
      if (!child.isMesh || !child.material) return;

      if (Array.isArray(child.material)) {
        for (let j = 0; j < child.material.length; j++) {
          if (child.material[j] && "wireframe" in child.material[j]) {
            child.material[j].wireframe = enabled;
          }
        }
        return;
      }

      if ("wireframe" in child.material) child.material.wireframe = enabled;
    });
  }
}

function wireSidebarToggles() {
  wireToggle("sb-toggle-minimap", "minimap", (enabled) => {
    setDisplay("minimap-container", enabled);
    setDisplay("minimap-label", enabled);
    import("./state.js")
      .then((m) => {
        m.state.showMinimap = enabled;
      })
      .catch((error) => console.warn("state.js failed to load (minimap)", error));
  });

  wireToggle("sb-toggle-legend", "legend", (enabled) => {
    setDisplay("legend", enabled);
    saveSettingValue("showLegend", enabled);
  });

  wireToggle("sb-toggle-labels", "labels", (enabled) => {
    saveSettingValue("showZoneLabels", enabled);
    import("./state.js")
      .then((m) => {
        m.state.showZoneLabels = enabled;
      })
      .catch((error) => console.warn("state.js failed to load (labels)", error));
    import("./zone-filter.js")
      .then((m) => m.toggleAllZones(enabled))
      .catch((error) => console.warn("zone-filter.js failed to load", error));
  });

  wireToggle("sb-toggle-wireframe", "wireframe", (enabled) => {
    import("./state.js")
      .then((m) => {
        m.state.wireframeMode = enabled;
        saveSettingValue("wireframeMode", enabled);
        applyWireframeToWorld(enabled);
      })
      .catch((error) => console.warn("state.js failed to load", error));
  });

  wireToggle("sb-toggle-grid", "grid", (enabled) => {
    import("./state.js")
      .then((m) => {
        m.state.gridVisible = enabled;
        saveSettingValue("gridVisible", enabled);
        import("./world.js")
          .then((w) => {
            if (w.setGridVisible) w.setGridVisible(enabled);
          })
          .catch((error) => console.warn("world.js failed to load", error));
      })
      .catch((error) => console.warn("state.js failed to load", error));
  });

  wireToggle("sb-toggle-ground", "ground", (enabled) => {
    import("./state.js")
      .then((m) => {
        m.state.groundVisible = enabled;
        saveSettingValue("groundVisible", enabled);
        import("./world.js")
          .then((w) => {
            if (w.setGroundVisible) w.setGroundVisible(enabled);
          })
          .catch((error) => console.warn("world.js failed to load", error));
      })
      .catch((error) => console.warn("state.js failed to load", error));
  });

  wireToggle("sb-toggle-water", "water", (enabled) => {
    import("./state.js")
      .then((m) => {
        m.state.waterVisible = enabled;
        saveSettingValue("waterVisible", enabled);
        import("./world.js")
          .then((w) => {
            if (w.setWaterVisible) w.setWaterVisible(enabled);
          })
          .catch((error) => console.warn("world.js failed to load (water)", error));
      })
      .catch((error) => console.warn("state.js failed to load (water)", error));
  });

  wireToggle("sb-toggle-fps", "fps", (enabled) => {
    setDisplay("fps", enabled, "block");
  });

  wireToggle("sb-toggle-perf", "perf", (enabled) => {
    import("./perf.js")
      .then((m) => {
        if (m.setPerfVisible) m.setPerfVisible(enabled);
        else m.togglePerf();
      })
      .catch((error) => console.warn("perf.js failed to load", error));
  });
}

function wireAction(id, action) {
  const element = document.getElementById(id);
  if (!element) return;
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
}

function wireSidebarActions() {
  wireAction("sb-catalog", () => {
    import("./catalog.js")
      .then((m) => m.toggleCatalog())
      .catch((error) => console.warn("catalog.js failed to load", error));
  });

  wireAction("sb-gallery", () => {
    const gallery = document.getElementById("gallery-overlay");
    if (gallery) gallery.classList.toggle("active");
  });

  wireAction("sb-settings", () => {
    const settings = document.getElementById("settings-overlay");
    if (settings) settings.classList.toggle("active");
  });

  wireAction("sb-help", () => {
    const help = document.getElementById("help-overlay");
    if (help) help.classList.toggle("active");
  });

  wireAction("sb-home", () => {
    import("./teleport.js")
      .then((t) => t.pushTeleportHistory())
      .catch(() => {});
    import("./scene.js")
      .then((m) => {
        m.camera.position.set(0, 1000, 1500);
        m.camera.lookAt(0, 0, 0);
      })
      .catch((error) => console.warn("scene.js failed to load", error));
  });

  wireAction("sb-screenshot", () => {
    import("./scene.js")
      .then((m) => {
        const dataUrl = m.renderer.domElement.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `rift-flythrough-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((error) => console.warn("scene.js failed to load", error));
  });
}

function exposeSidebarSync() {
  window.updateSidebarDot = (id, enabled) => {
    setSidebarDot(id, Boolean(enabled));
  };
}

function initSidebar() {
  wireSidebarCollapse();
  wireSectionHeaders();
  wireSidebarToggles();
  wireSidebarActions();
  exposeSidebarSync();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSidebar, { once: true });
} else {
  initSidebar();
}
