(function () {
  "use strict";

  var config = window.KOINO_JOIN_CONFIG || {};
  var strings = {
    sv: {
      pageTitle: "KOINO — Gå med i en gemenskap",
      eyebrow: "Inbjudan",
      title: "Du är inbjuden till en gemenskap",
      lede: "Öppna KOINO för att gå med. Om appen inte finns på telefonen hjälper vi dig vidare.",
      codeLabel: "Gemenskapskod",
      copy: "Kopiera",
      copied: "Kopierat",
      open: "Öppna KOINO",
      hint: "Om appen inte öppnas, ange koden i appen.",
      getTitle: "Har du inte appen?",
      getBody: "Installera KOINO och öppna sedan den här sidan igen, eller ange koden i appen.",
      iosStore: "Hämta i App Store",
      androidStore: "Hämta i Google Play",
      storeNote: "KOINO är i sluten testning. Gå med i väntelistan så får du besked när appen släpps.",
      waitlist: "Gå med i väntelistan",
      desktopTitle: "Öppna på telefonen",
      desktopBody: "Den här inbjudan öppnas i KOINO-appen. Skanna QR-koden med telefonen eller ange koden i appen.",
      invalidTitle: "Länken är inte giltig",
      invalidBody: "Scanna QR-koden från gemenskapen igen, eller be om en ny inbjudan.",
      home: "Till KOINO",
      footer: "Närmare Gud. Närmare varandra."
    },
    en: {
      pageTitle: "KOINO — Join a community",
      eyebrow: "Invitation",
      title: "You're invited to a community",
      lede: "Open KOINO to join. If the app isn't on this phone, we'll help you get it.",
      codeLabel: "Community code",
      copy: "Copy",
      copied: "Copied",
      open: "Open KOINO",
      hint: "If the app doesn't open, enter the code in the app.",
      getTitle: "Don't have the app?",
      getBody: "Install KOINO, then open this page again or enter the code in the app.",
      iosStore: "Download on the App Store",
      androidStore: "Get it on Google Play",
      storeNote: "KOINO is in closed testing. Join the waitlist and we'll let you know when it launches.",
      waitlist: "Join the waitlist",
      desktopTitle: "Open on your phone",
      desktopBody: "This invitation opens in the KOINO app. Scan the QR code with your phone or enter the code in the app.",
      invalidTitle: "This link isn't valid",
      invalidBody: "Scan the community QR code again, or ask for a new invitation.",
      home: "Go to KOINO",
      footer: "Closer to God. Closer to each other."
    }
  };

  var params = new URLSearchParams(window.location.search);
  var lang = (navigator.language || "sv").toLowerCase().indexOf("sv") === 0 ? "sv" : "en";
  var forcedLang = (params.get("lang") || "").toLowerCase();
  if (forcedLang === "sv" || forcedLang === "en") lang = forcedLang;

  var invite = document.getElementById("invite");
  var get = document.getElementById("get");
  var invalid = document.getElementById("invalid");
  var codeValue = document.getElementById("codeValue");
  var copyCode = document.getElementById("copyCode");
  var copyStatus = document.getElementById("copyStatus");
  var openApp = document.getElementById("openApp");
  var openHint = document.getElementById("openHint");
  var getTitle = get.querySelector("h2");
  var getBody = get.querySelector(".get-body");
  var iosStore = document.getElementById("iosStore");
  var androidStore = document.getElementById("androidStore");
  var storeNote = document.getElementById("storeNote");
  var waitlist = document.getElementById("waitlist");

  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  var isAndroid = /Android/i.test(navigator.userAgent);
  var isMobile = isIOS || isAndroid;

  function t(key) {
    return (strings[lang] && strings[lang][key]) || strings.sv[key] || "";
  }

  function applyLanguage() {
    document.documentElement.lang = lang;
    document.title = t("pageTitle");
    document.querySelectorAll("[data-i18n]").forEach(function (element) {
      var key = element.getAttribute("data-i18n");
      if (key) element.textContent = t(key);
    });
    document.querySelectorAll("[data-lang]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-lang") === lang ? "true" : "false");
    });
    getTitle.textContent = isMobile ? t("getTitle") : t("desktopTitle");
    getBody.textContent = isMobile ? t("getBody") : t("desktopBody");
    copyCode.textContent = copyStatus.dataset.copied === "1" ? t("copied") : t("copy");
  }

  function show(section) {
    [invite, get, invalid].forEach(function (element) {
      element.classList.toggle("hidden", element.id !== section);
    });
  }

  var code = params.get("code") || "";
  if (!code) {
    var parts = window.location.pathname.split("/").filter(Boolean);
    var at = parts.indexOf("join");
    if (at >= 0 && parts[at + 1]) code = decodeURIComponent(parts[at + 1]);
  }
  code = (code || "").trim().toUpperCase();
  var valid = /^[A-Z0-9_-]{3,160}$/.test(code);

  if (!valid) {
    show("invalid");
    applyLanguage();
    return;
  }

  codeValue.textContent = code;
  var appUrl = "koino://join?code=" + encodeURIComponent(code);
  openApp.href = isAndroid
    ? "intent://join?code=" + encodeURIComponent(code) +
      "#Intent;scheme=koino;package=com.akhansson.koinomvp;S.browser_fallback_url=" +
      encodeURIComponent(window.location.href) + ";end"
    : appUrl;

  var storesLive = Boolean(config.storesLive);
  var iosStoreUrl = config.iosStoreUrl || "https://apps.apple.com/app/id6809953941";
  var androidStoreUrl = config.androidStoreUrl || "https://play.google.com/store/apps/details?id=com.akhansson.koinomvp";
  var waitlistUrl = config.waitlistUrl || "https://koinolabs.com/#waitlist";

  iosStore.href = iosStoreUrl;
  androidStore.href = androidStoreUrl;
  waitlist.href = waitlistUrl;

  if (!isMobile) {
    openApp.classList.add("hidden");
    openHint.classList.add("hidden");
    get.classList.remove("hidden");
  }

  if (storesLive) {
    if (isIOS) iosStore.classList.remove("hidden");
    else if (isAndroid) androidStore.classList.remove("hidden");
    else {
      iosStore.classList.remove("hidden");
      androidStore.classList.remove("hidden");
    }
    storeNote.classList.add("hidden");
    waitlist.classList.add("hidden");
  } else {
    storeNote.classList.remove("hidden");
    waitlist.classList.remove("hidden");
  }

  applyLanguage();

  if (isMobile) {
    window.setTimeout(function () {
      if (document.visibilityState === "visible") get.classList.remove("hidden");
    }, 2600);
  }

  if (storesLive && isMobile && config.autoStoreRedirect !== false) {
    window.setTimeout(function () {
      if (document.visibilityState !== "visible") return;
      var target = isIOS ? iosStoreUrl : androidStoreUrl;
      if (target) window.location.href = target;
    }, 3200);
  }

  copyCode.addEventListener("click", function () {
    function done() {
      copyStatus.dataset.copied = "1";
      copyStatus.textContent = t("copied");
      copyCode.textContent = t("copied");
      window.setTimeout(function () {
        copyStatus.dataset.copied = "0";
        copyStatus.textContent = "";
        copyCode.textContent = t("copy");
      }, 1800);
    }

    function fallbackCopy() {
      var area = document.createElement("textarea");
      area.value = code;
      area.setAttribute("readonly", "");
      area.className = "copy-fallback";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        done();
      } catch (error) {
        copyStatus.textContent = code;
      }
      document.body.removeChild(area);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  document.querySelectorAll("[data-lang]").forEach(function (button) {
    button.addEventListener("click", function () {
      lang = button.getAttribute("data-lang");
      applyLanguage();
    });
  });
})();
