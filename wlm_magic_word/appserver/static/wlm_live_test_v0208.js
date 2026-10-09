require([
    "jquery",
    "splunkjs/mvc",
    "splunkjs/mvc/simplexml/ready!"
], function($, mvc) {
    "use strict";

    var manager = mvc.Components.get("real_wlm_search");
    var overlay = document.getElementById("wlm-live-overlay");
    var messageNode = document.getElementById("live-wlm-message");
    var titleNode = document.getElementById("live-overlay-title");
    var taglineNode = document.getElementById("live-tagline");
    var dinoNode = document.getElementById("live-dino");
    var remediationNode = document.getElementById("live-remediation");
    var admittedToast = document.getElementById("wlm-admitted-toast");
    var admittedMetrics = document.getElementById("live-admitted-metrics");
    var resultsContainer = document.getElementById("live_results");
    var runButton = document.getElementById("run-live-search");
    var defaultTokens = mvc.Components.get("default");
    var exactMarker = /\bWLM-DENIED:/i;
    var fallbackDetector = /\b(?:wlm|workload|admission)\b|(?:reject|deni)(?:ed|al).*\b(?:search|rule|policy)\b/i;
    var audioContext = null;
    var activeTheme = "DEFAULT";
    var rejectedCurrentSearch = false;
    var completionHandled = false;
    var suppressPanelObserver = false;
    var dispatchGeneration = 0;
    var dispatchPhase = "idle";
    var lastPanelText = resultsContainer ? resultsContainer.textContent : "";
    var autoSound = readSoundPreference();
    var completedRuntime = "0.00s";
    var completedResults = 0;

    var themes = {
        DEFAULT: {
            icon: "🦖⌨", headline: "AH-AH-AH!", tagline: "You didn't say the magic word.",
            remediation: "Refine the search and try again.", sound: [[330, .15], [247, .15], [330, .22]]
        },
        WILDCARD: {
            icon: "🦖✱", headline: "NOT EVERY INDEX!", tagline: "Objects in index=* may be larger than they appear.",
            remediation: "Replace index=* with one or more explicit indexes.", sound: [[392, .11], [294, .11], [196, .28]]
        },
        ALLTIME: {
            icon: "⏳🦴", headline: "PREHISTORIC RANGE!", tagline: "All time goes back a little too far.",
            remediation: "Choose the smallest time range that answers the question.", sound: [[440, .12], [370, .12], [294, .12], [220, .3]]
        },
        JOIN: {
            icon: "🦖💥🦖", headline: "JOIN COLLISION!", tagline: "That join has chosen violence.",
            remediation: "Consider stats, eventstats, lookup, or a narrower subsearch.", sound: [[180, .09], [110, .34]]
        },
        CONCURRENCY: {
            icon: "🦖🦖🦖", headline: "HOLD ONTO YOUR BUTTS!", tagline: "The search queue is already full.",
            remediation: "Wait for a running search to finish or review concurrency limits.", sound: [[262, .1], [330, .1], [392, .1], [262, .26]]
        },
        RUNTIME: {
            icon: "🦴⌨", headline: "STILL RUNNING?", tagline: "The dinosaurs have become fossils.",
            remediation: "Reduce the scope, optimize the SPL, or schedule the workload.", sound: [[330, .14], [277, .18], [220, .32]]
        },
        REALTIME: {
            icon: "🚨🦖", headline: "REAL-TIME RAMPAGE!", tagline: "Continuous searches continuously consume resources.",
            remediation: "Evaluate scheduled or indexed real-time detection instead.", sound: [[440, .09], [660, .09], [440, .09], [660, .22]]
        }
    };

    function readSoundPreference() {
        try { return window.localStorage.getItem("wlmMagicWordAutoSound") !== "off"; }
        catch (error) { return true; }
    }

    function saveSoundPreference() {
        try { window.localStorage.setItem("wlmMagicWordAutoSound", autoSound ? "on" : "off"); }
        catch (error) { /* Preference remains valid for this page. */ }
    }

    function armAudio() {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { return; }
        if (!audioContext) { audioContext = new AudioContext(); }
        if (audioContext.state === "suspended") { audioContext.resume(); }
    }

    function playPattern(themeName) {
        var theme = themes[themeName] || themes.DEFAULT;
        armAudio();
        if (!audioContext || audioContext.state !== "running") { return; }
        var cursor = audioContext.currentTime + .02;
        theme.sound.forEach(function(note) {
            var oscillator = audioContext.createOscillator();
            var gain = audioContext.createGain();
            oscillator.type = themeName === "RUNTIME" ? "sine" : "square";
            oscillator.frequency.value = note[0];
            gain.gain.setValueAtTime(.0001, cursor);
            gain.gain.exponentialRampToValueAtTime(.07, cursor + .015);
            gain.gain.exponentialRampToValueAtTime(.0001, cursor + note[1]);
            oscillator.connect(gain);
            gain.connect(audioContext.destination);
            oscillator.start(cursor);
            oscillator.stop(cursor + note[1] + .02);
            cursor += note[1] + .055;
        });
    }

    function collectMessages(value, output, seen) {
        var keys;
        if (value === null || value === undefined) { return; }
        if (typeof value === "string") {
            var trimmed = value.trim();
            if (!trimmed) { return; }
            if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
                try { collectMessages(JSON.parse(trimmed), output, seen); return; }
                catch (error) { /* Some callbacks contain non-JSON diagnostics. */ }
            }
            output.push(trimmed);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(function(item) { collectMessages(item, output, seen); });
            return;
        }
        if (typeof value !== "object" || seen.indexOf(value) !== -1) { return; }
        seen.push(value);
        keys = ["responseJSON", "responseText", "messages", "message", "text", "error", "statusText"];
        keys.forEach(function(key) {
            if (Object.prototype.hasOwnProperty.call(value, key)) { collectMessages(value[key], output, seen); }
        });
    }

    function parseDenial(value) {
        var messages = [];
        collectMessages(value, messages, []);
        var marked = messages.filter(function(message) { return exactMarker.test(message); });
        if (marked.length) {
            marked.sort(function(left, right) { return left.length - right.length; });
            var match = marked[0].match(/WLM-DENIED:(?:([A-Z][A-Z0-9_]*):)?\s*([^"}\]\r\n]+)/i);
            if (match) {
                var code = (match[1] || "DEFAULT").toUpperCase();
                return {
                    code: themes[code] ? code : "DEFAULT",
                    message: ("WLM-DENIED:" + (match[1] ? match[1].toUpperCase() + ": " : " ") + match[2]).trim()
                };
            }
            return { code: "DEFAULT", message: marked[0] };
        }
        var relevant = messages.filter(function(message) { return fallbackDetector.test(message); });
        if (relevant.length) {
            relevant.sort(function(left, right) { return left.length - right.length; });
            return { code: "DEFAULT", message: relevant[0] };
        }
        return null;
    }

    function applyTheme(themeName) {
        var theme = themes[themeName] || themes.DEFAULT;
        activeTheme = themes[themeName] ? themeName : "DEFAULT";
        overlay.className = "wlm-overlay theme-" + activeTheme.toLowerCase();
        dinoNode.textContent = theme.icon;
        titleNode.textContent = theme.headline;
        taglineNode.textContent = theme.tagline;
        remediationNode.textContent = theme.remediation;
    }

    function showOverlay(denial) {
        if (!overlay) { return; }
        rejectedCurrentSearch = true;
        suppressPanelObserver = false;
        applyTheme(denial.code || "DEFAULT");
        messageNode.textContent = denial.message || "Splunk reported a WLM admission rejection.";
        overlay.classList.add("visible");
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("wlm-overlay-open");
        if (autoSound) { playPattern(activeTheme); }
    }

    function hideOverlay() {
        if (!overlay) { return; }
        overlay.classList.remove("visible");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("wlm-overlay-open");
    }

    function showAdmitted() {
        if (!admittedToast || rejectedCurrentSearch) { return; }
        if (admittedMetrics) {
            admittedMetrics.textContent = completedResults + " result" + (completedResults === 1 ? "" : "s") + " · " + completedRuntime;
        }
        admittedToast.classList.add("visible");
        window.setTimeout(function() { admittedToast.classList.remove("visible"); }, 3200);
    }

    function updateCompletionMetrics(properties) {
        var content = properties && properties.content || {};
        var runtime = Number(content.runDuration || content.run_duration || 0);
        var resultCount = content.resultCount;
        if (resultCount === undefined) { resultCount = content.result_count; }
        if (runtime >= 0) { completedRuntime = runtime.toFixed(2) + "s"; }
        if (resultCount !== undefined && resultCount !== null) { completedResults = Number(resultCount) || 0; }
    }

    function inspect(value) {
        var denial = parseDenial(value);
        if (denial) {
            if (rejectedCurrentSearch) {
                setRunState(false);
                return;
            }
            showOverlay(denial);
            setRunState(false);
        }
    }

    function inspectArguments() { inspect(Array.prototype.slice.call(arguments)); }

    function setRunState(running) {
        if (!runButton) { return; }
        runButton.disabled = running;
        runButton.textContent = running ? "Running…" : "Run / Rerun Search";
    }

    function runCurrentSearch() {
        if (!manager || !defaultTokens) { return; }
        var thisDispatch = ++dispatchGeneration;
        armAudio();
        hideOverlay();
        rejectedCurrentSearch = false;
        completionHandled = false;
        suppressPanelObserver = true;
        dispatchPhase = "resetting";
        setRunState(true);
        if (admittedToast) { admittedToast.classList.remove("visible"); }
        lastPanelText = smallestMarkerText(resultsContainer);

        var searchText = defaultTokens.get("live_spl") || "| makeresults";
        var earliest = defaultTokens.get("live_time.earliest") || "-15m";
        var latest = defaultTokens.get("live_time.latest") || "now";

        // A Filter Search admission denial can leave Splunk 10.2.x's
        // SearchManager attached to a terminal job.  Starting it again in the
        // same turn may reuse that job when the SPL and time range are
        // unchanged.  Cancel first and cross an event-loop boundary so every
        // click creates a fresh dispatch.
        try { manager.cancel(); }
        catch (error) { /* A manager with no active SID is already reset. */ }

        window.setTimeout(function() {
            if (thisDispatch !== dispatchGeneration) { return; }
            dispatchPhase = "starting";
            completionHandled = false;
            manager.settings.set("search", searchText);
            manager.settings.set("earliest_time", earliest);
            manager.settings.set("latest_time", latest);
            try { manager.startSearch(); }
            catch (error) {
                dispatchPhase = "finished";
                suppressPanelObserver = false;
                setRunState(false);
                inspect(error);
            }
        }, 75);
    }

    function smallestMarkerText(root) {
        var candidates = [];
        if (!root) { return ""; }

        // A search result can legitimately contain an older WLM-DENIED log
        // event (for example, index=_internal).  Result cells are evidence,
        // not a rejection of the current dispatch, and must never trigger the
        // overlay.  Filter Search warnings render outside these value nodes.
        function isResultValue(node) {
            var element = node && (node.nodeType === 1 ? node : node.parentElement);
            var warningSelector = "[role='alert'],.alert,.alert-error,.alert-warning,.splunk-message-container,[class*='message'],[class*='warning']";
            if (element && element.closest(warningSelector)) { return false; }
            return Boolean(element && element.closest("table,thead,tbody,tr,th,td,.shared-resultstable-resultstablerow,.shared-resultstable-resultstablebody"));
        }

        var walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            if (isResultValue(node)) { continue; }
            var text = (node.nodeValue || "").trim();
            if (text && exactMarker.test(text)) { candidates.push(text); }
        }

        candidates.sort(function(left, right) { return left.length - right.length; });
        return candidates[0] || "";
    }

    function inspectRenderedPanel() {
        if (suppressPanelObserver) { return; }
        var markerText = smallestMarkerText(resultsContainer);
        if (markerText === lastPanelText) { return; }
        lastPanelText = markerText;
        if (markerText) { inspect(markerText); }
    }

    function finishSuccessfulSearch() {
        if (dispatchPhase === "resetting") { return; }
        if (completionHandled) { return; }
        var finishedGeneration = dispatchGeneration;
        completionHandled = true;
        dispatchPhase = "finished";
        setRunState(false);
        window.setTimeout(function() {
            if (finishedGeneration !== dispatchGeneration) { return; }
            suppressPanelObserver = false;
            lastPanelText = "";
            inspectRenderedPanel();
            showAdmitted();
        }, 250);
    }

    function updateSoundButton() {
        var toggle = document.getElementById("auto-sound-toggle");
        if (!toggle) { return; }
        toggle.textContent = "App sound: " + (autoSound ? "on" : "off");
        toggle.setAttribute("aria-pressed", autoSound ? "true" : "false");
    }

    function getManagerData(source, options) {
        try { return manager && manager.data(source, options); }
        catch (error) { return null; }
    }

    if (manager) {
        manager.on("search:start", function() {
            dispatchPhase = "running";
            rejectedCurrentSearch = false;
            completionHandled = false;
            completedRuntime = "0.00s";
            completedResults = 0;
            setRunState(true);
            if (admittedToast) { admittedToast.classList.remove("visible"); }
        });
        manager.on("search:error", function() {
            dispatchPhase = "finished";
            suppressPanelObserver = false;
            inspectArguments.apply(null, arguments);
            setRunState(false);
        });
        manager.on("search:fail", function() {
            dispatchPhase = "finished";
            suppressPanelObserver = false;
            inspectArguments.apply(null, arguments);
            setRunState(false);
        });
        manager.on("search:progress", function(properties) {
            updateCompletionMetrics(properties);
            inspect(properties);
            if (properties && properties.content && properties.content.isDone) {
                finishSuccessfulSearch();
            }
        });
        manager.on("search:done", function() {
            inspectArguments.apply(null, arguments);
            finishSuccessfulSearch();
        });
        var results = getManagerData("results", { count: 1 });
        if (results) {
            results.on("data", function() {
                var data = results.data();
                if (completedResults === 0 && data && Array.isArray(data.results)) { completedResults = data.results.length; }
                else if (completedResults === 0 && data && Array.isArray(data.rows)) { completedResults = data.rows.length; }
                finishSuccessfulSearch();
            });
            results.on("error", function() { setRunState(false); });
        }
    }

    // Splunk 10.2.x can reuse the same rejected promise inside SearchManager,
    // so search:error is not guaranteed to fire for the second identical
    // pre-SID HTTP 400.  The underlying request still fails every time.  Watch
    // only this app's search-creation endpoint and inspect that response.
    $(document)
        .off("ajaxError.wlmMagicWord")
        .on("ajaxError.wlmMagicWord", function(event, xhr, settings) {
            var url = settings && settings.url ? settings.url.split("?")[0] : "";
            var method = settings && (settings.type || settings.method) || "";
            var isOwnSearchCreation = /\/servicesNS\/[^/]+\/wlm_magic_word\/search\/v2\/jobs\/?$/i.test(url);
            if (String(method).toUpperCase() !== "POST" || !isOwnSearchCreation) { return; }
            dispatchPhase = "finished";
            suppressPanelObserver = false;
            inspect(xhr);
            setRunState(false);
        });

    var close = document.getElementById("close-overlay");
    var sound = document.getElementById("live-sound-button");
    var toggle = document.getElementById("auto-sound-toggle");
    if (window.MutationObserver && resultsContainer) {
        new MutationObserver(inspectRenderedPanel).observe(resultsContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }
    document.addEventListener("pointerdown", armAudio, { once: true });
    updateSoundButton();
    if (runButton) { runButton.addEventListener("click", runCurrentSearch); }
    if (close) { close.addEventListener("click", hideOverlay); }
    if (sound) { sound.addEventListener("click", function() { playPattern(activeTheme); }); }
    if (toggle) {
        toggle.addEventListener("click", function() {
            autoSound = !autoSound;
            saveSoundPreference();
            updateSoundButton();
            if (autoSound) { armAudio(); }
        });
    }
    window.addEventListener("storage", function(event) {
        if (event.key !== "wlmMagicWordAutoSound") { return; }
        autoSound = event.newValue !== "off";
        updateSoundButton();
    });
    if (overlay) { overlay.addEventListener("click", function(event) { if (event.target === overlay) { hideOverlay(); } }); }
    document.addEventListener("keydown", function(event) { if (event.key === "Escape") { hideOverlay(); } });
});
