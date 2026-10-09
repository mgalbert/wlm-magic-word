require([
    "jquery",
    "splunkjs/mvc",
    "splunkjs/mvc/simplexml/ready!"
], function($, mvc) {
    "use strict";

    var VERSION = "0.20.6";
    var manager = mvc.Components.get("park_search_manager");
    var editor = byId("park-spl-editor");
    var timeRange = byId("park-time-range");
    var runButton = byId("park-run");
    var stopButton = byId("park-stop");
    var restoreButton = byId("park-restore");
    var resultNode = byId("park-results");
    var warningNode = byId("park-inline-warning");
    var overlay = byId("park-wlm-overlay");
    var admittedToast = byId("park-admitted-toast");
    var admittedTimer = null;
    var exactMarker = /\bWLM-DENIED:/i;
    var fallbackDetector = /\b(?:wlm|workload|admission)\b|(?:reject|deni)(?:ed|al).*\b(?:search|rule|policy)\b/i;
    var dispatch = 0;
    var phase = "idle";
    var rejected = false;
    var stopped = false;
    var completionRecorded = false;
    var quietMode = readPreference("parkProfessionalMode") === "on";
    var activeTheme = "DEFAULT";
    var audioContext = null;
    var originalSearch = editor ? editor.value : "";
    var rows = [];
    var fields = [];
    var messages = [];
    var activeTab = "events";
    var history = readHistory();

    var themes = {
        DEFAULT: { icon: "🦖⌨", headline: "AH-AH-AH!", tagline: "You didn't say the magic word.", remediation: "Refine the search and try again.", sound: [[330,.15],[247,.15],[330,.22]] },
        WILDCARD: { icon: "🦖✱", headline: "NOT EVERY INDEX!", tagline: "Objects in index=* may be larger than they appear.", remediation: "Replace index=* with one or more explicit indexes.", sound: [[392,.11],[294,.11],[196,.28]] },
        ALLTIME: { icon: "⏳🦴", headline: "PREHISTORIC RANGE!", tagline: "All time goes back a little too far.", remediation: "Choose the smallest time range that answers the question.", sound: [[440,.12],[370,.12],[294,.12],[220,.3]] },
        JOIN: { icon: "🦖💥🦖", headline: "JOIN COLLISION!", tagline: "That join has chosen violence.", remediation: "Consider stats, eventstats, lookup, or a narrower subsearch.", sound: [[180,.09],[110,.34]] },
        CONCURRENCY: { icon: "🦖🦖🦖", headline: "HOLD ONTO YOUR BUTTS!", tagline: "The search queue is already full.", remediation: "Wait for a running search to finish or review concurrency limits.", sound: [[262,.1],[330,.1],[392,.1],[262,.26]] },
        RUNTIME: { icon: "🦴⌨", headline: "STILL RUNNING?", tagline: "The dinosaurs have become fossils.", remediation: "Reduce the scope, optimize the SPL, or schedule the workload.", sound: [[330,.14],[277,.18],[220,.32]] },
        REALTIME: { icon: "🚨🦖", headline: "REAL-TIME RAMPAGE!", tagline: "Continuous searches continuously consume resources.", remediation: "Evaluate scheduled or indexed real-time detection instead.", sound: [[440,.09],[660,.09],[440,.09],[660,.22]] }
    };

    function byId(id) { return document.getElementById(id); }
    function text(id, value) { var node = byId(id); if (node) { node.textContent = String(value); } }
    function readPreference(key) { try { return window.localStorage.getItem(key); } catch (error) { return null; } }
    function writePreference(key, value) { try { window.localStorage.setItem(key, value); } catch (error) { /* preference is optional */ } }
    function nowLabel() { return new Date().toLocaleTimeString(); }

    function getManagerData(source, options) {
        try { return manager && manager.data(source, options); }
        catch (error) { return null; }
    }

    function readHistory() {
        try { return JSON.parse(window.sessionStorage.getItem("parkSearchHistory") || "[]"); }
        catch (error) { return []; }
    }

    function saveHistory() {
        try { window.sessionStorage.setItem("parkSearchHistory", JSON.stringify(history.slice(0, 12))); }
        catch (error) { /* session history is optional */ }
    }

    function addHistory(search, earliest, outcome) {
        history.unshift({ search: search, earliest: earliest, outcome: outcome, at: nowLabel() });
        history = history.slice(0, 12);
        saveHistory();
        renderHistory();
    }

    function renderHistory() {
        var root = byId("park-history-list");
        if (!root) { return; }
        root.textContent = "";
        if (!history.length) { var empty = document.createElement("p"); empty.className = "park-empty"; empty.textContent = "No searches yet."; root.appendChild(empty); return; }
        history.forEach(function(item) {
            var button = document.createElement("button");
            var code = document.createElement("code");
            var meta = document.createElement("span");
            button.type = "button"; button.className = "park-history-item outcome-" + String(item.outcome || "unknown").toLowerCase();
            code.textContent = item.search;
            meta.textContent = item.at + " · " + item.earliest + " · " + item.outcome;
            button.appendChild(code); button.appendChild(meta);
            button.addEventListener("click", function() {
                editor.value = item.search; timeRange.value = item.earliest;
                restoreButton.disabled = editor.value === originalSearch;
            });
            root.appendChild(button);
        });
    }

    function setPhase(next, label) {
        phase = next;
        var status = byId("park-status");
        if (status) { status.className = "park-status state-" + next; }
        text("park-status-label", label || next.toUpperCase());
        text("diag-phase", next);
        text("diag-updated", nowLabel());
    }

    function setRunning(running) {
        if (runButton) { runButton.disabled = running; runButton.textContent = running ? "Running…" : "Run Search"; }
        if (stopButton) { stopButton.disabled = !running; }
    }

    function updateProgress(properties) {
        var content = properties && properties.content || {};
        text("park-runtime", Number(content.runDuration || content.run_duration || 0).toFixed(2) + "s");
        text("park-event-count", content.eventCount || content.event_count || 0);
        text("park-result-count", content.resultCount || content.result_count || rows.length || 0);
        var sid = content.sid || getSid();
        if (sid) { text("park-sid", sid); }
    }

    function getSid() {
        try { return manager && manager.job && manager.job.get("sid") || ""; }
        catch (error) { return ""; }
    }

    function collectMessages(value, output, seen) {
        var keys;
        if (value === null || value === undefined) { return; }
        if (typeof value === "string") {
            var trimmed = value.trim(); if (!trimmed) { return; }
            if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
                try { collectMessages(JSON.parse(trimmed), output, seen); return; } catch (error) { /* non-JSON diagnostic */ }
            }
            output.push(trimmed); return;
        }
        if (Array.isArray(value)) { value.forEach(function(item) { collectMessages(item, output, seen); }); return; }
        if (typeof value !== "object" || seen.indexOf(value) !== -1) { return; }
        seen.push(value);
        keys = ["responseJSON", "responseText", "messages", "message", "text", "error", "statusText"];
        keys.forEach(function(key) { if (Object.prototype.hasOwnProperty.call(value, key)) { collectMessages(value[key], output, seen); } });
    }

    function parseDenial(value) {
        var found = []; collectMessages(value, found, []);
        var marked = found.filter(function(message) { return exactMarker.test(message); });
        if (marked.length) {
            marked.sort(function(a,b) { return a.length-b.length; });
            var match = marked[0].match(/WLM-DENIED:(?:([A-Z][A-Z0-9_]*):)?\s*([^"}\]\r\n]+)/i);
            if (match) {
                var code = (match[1] || "DEFAULT").toUpperCase();
                return { code: themes[code] ? code : "DEFAULT", marker: "WLM-DENIED:" + (match[1] ? match[1].toUpperCase() + ":" : ""), message: marked[0] };
            }
            return { code: "DEFAULT", marker: "WLM-DENIED:", message: marked[0] };
        }
        var relevant = found.filter(function(message) { return fallbackDetector.test(message); });
        return relevant.length ? { code: "DEFAULT", marker: "fallback", message: relevant.sort(function(a,b){return a.length-b.length;})[0] } : null;
    }

    function armAudio() {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { return; }
        if (!audioContext) { audioContext = new AudioContext(); }
        if (audioContext.state === "suspended") { audioContext.resume(); }
    }

    function playPattern(themeName) {
        var theme = themes[themeName] || themes.DEFAULT; armAudio();
        if (!audioContext || audioContext.state !== "running") { return; }
        var cursor = audioContext.currentTime + .02;
        theme.sound.forEach(function(note) {
            var oscillator = audioContext.createOscillator(); var gain = audioContext.createGain();
            oscillator.type = themeName === "RUNTIME" ? "sine" : "square"; oscillator.frequency.value = note[0];
            gain.gain.setValueAtTime(.0001,cursor); gain.gain.exponentialRampToValueAtTime(.07,cursor+.015); gain.gain.exponentialRampToValueAtTime(.0001,cursor+note[1]);
            oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(cursor); oscillator.stop(cursor+note[1]+.02); cursor += note[1]+.055;
        });
    }

    function hideSuccess() {
        if (admittedTimer) { window.clearTimeout(admittedTimer); admittedTimer = null; }
        if (admittedToast) { admittedToast.classList.remove("visible"); }
    }

    function showSuccess() {
        if (quietMode || !admittedToast) { return; }
        hideSuccess();
        var runtime = byId("park-runtime") ? byId("park-runtime").textContent : "—";
        var results = byId("park-result-count") ? byId("park-result-count").textContent : "0";
        text("park-admitted-metrics",results+" result"+(results === "1" ? "" : "s")+" · "+runtime);
        admittedToast.classList.add("visible");
        admittedTimer = window.setTimeout(function() { admittedToast.classList.remove("visible"); admittedTimer = null; },3200);
    }

    function showDenial(denial, trigger, httpStatus) {
        if (rejected) { return; }
        rejected = true; completionRecorded = true; activeTheme = denial.code || "DEFAULT";
        var theme = themes[activeTheme] || themes.DEFAULT;
        setRunning(false); setPhase("denied", "DENIED");
        text("diag-trigger", trigger || "unknown"); text("diag-http", httpStatus || "—"); text("diag-marker", denial.marker || "—");
        warningNode.textContent = denial.message; warningNode.classList.add("visible");
        addMessage("FATAL", denial.message);
        addHistory(originalSearch, timeRange.value, "denied");
        hideSuccess();
        if (quietMode || !overlay) { return; }
        overlay.className = "wlm-overlay theme-" + activeTheme.toLowerCase() + " visible";
        overlay.setAttribute("aria-hidden", "false"); document.body.classList.add("wlm-overlay-open");
        text("park-dino", theme.icon); text("park-overlay-title", theme.headline); text("park-tagline", theme.tagline);
        text("park-wlm-message", denial.message); text("park-remediation", theme.remediation);
        if (readPreference("wlmMagicWordAutoSound") !== "off") { playPattern(activeTheme); }
    }

    function inspect(value, trigger, status) { var denial = parseDenial(value); if (denial) { showDenial(denial, trigger, status); return true; } return false; }

    function addMessage(type, value) {
        if (!value) { return; }
        if (!messages.some(function(item) { return item.type === type && item.text === value; })) { messages.push({ type:type, text:value }); }
        text("park-message-count", messages.length); if (activeTab === "messages") { renderResults(); }
    }

    function normalizeResults(data) {
        rows = []; fields = [];
        if (!data) { return; }
        if (Array.isArray(data.results)) {
            rows = data.results; data.results.forEach(function(row) { Object.keys(row).forEach(function(key) { if (fields.indexOf(key) === -1) { fields.push(key); } }); });
        } else if (Array.isArray(data.rows) && Array.isArray(data.fields)) {
            fields = data.fields.map(function(field) { return typeof field === "string" ? field : field.name; });
            rows = data.rows.map(function(row) { var object = {}; fields.forEach(function(field,index) { object[field] = row[index]; }); return object; });
        }
        text("park-result-count", rows.length);
    }

    function renderResults() {
        if (!resultNode) { return; } resultNode.textContent = "";
        if (activeTab === "messages") {
            if (!messages.length) { appendEmpty("No job messages."); return; }
            messages.forEach(function(item) { var node=document.createElement("div"); node.className="park-event"; node.textContent=item.type+": "+item.text; resultNode.appendChild(node); }); return;
        }
        if (!rows.length) { appendEmpty(rejected ? "Search was denied before results were created." : "No results returned."); return; }
        if (activeTab === "events") {
            rows.forEach(function(row) { var node=document.createElement("div"); var time=document.createElement("span"); node.className="park-event"; time.className="park-event-time"; time.textContent=row._time || "event"; node.appendChild(time); node.appendChild(document.createTextNode(row._raw || JSON.stringify(row))); resultNode.appendChild(node); }); return;
        }
        var table=document.createElement("table"); var head=document.createElement("thead"); var header=document.createElement("tr"); var body=document.createElement("tbody"); table.className="park-table";
        fields.forEach(function(field) { var th=document.createElement("th"); th.textContent=field; header.appendChild(th); }); head.appendChild(header); table.appendChild(head);
        rows.forEach(function(row) { var tr=document.createElement("tr"); fields.forEach(function(field) { var td=document.createElement("td"); td.textContent=row[field] === undefined ? "" : String(row[field]); tr.appendChild(td); }); body.appendChild(tr); });
        table.appendChild(body); resultNode.appendChild(table);
    }

    function appendEmpty(value) { var node=document.createElement("p"); node.className="park-empty"; node.textContent=value; resultNode.appendChild(node); }

    function runSearch() {
        if (!manager || !editor) { return; }
        var thisDispatch = ++dispatch; var search = editor.value.trim() || "| makeresults"; var earliest = timeRange.value || "-15m";
        originalSearch = search; restoreButton.disabled = true; rejected = false; stopped = false; completionRecorded = false; rows=[]; fields=[]; messages=[];
        warningNode.classList.remove("visible"); warningNode.textContent=""; hideOverlay(); hideSuccess(); renderResults(); text("park-message-count",0);
        text("diag-dispatch",thisDispatch); text("diag-http","pending"); text("diag-trigger","dispatch"); text("diag-marker","—"); text("park-sid","—");
        setRunning(true); setPhase("resetting","STARTING"); armAudio();
        try { manager.cancel(); } catch (error) { /* no active SID */ }
        window.setTimeout(function() {
            if (thisDispatch !== dispatch) { return; }
            setPhase("starting","STARTING");
            manager.settings.set("search",search); manager.settings.set("earliest_time",earliest); manager.settings.set("latest_time","now");
            try { manager.startSearch(); } catch (error) { setRunning(false); setPhase("failed","FAILED"); addMessage("ERROR",String(error)); inspect(error,"startSearch","client"); }
        },75);
    }

    function stopSearch() {
        stopped=true; completionRecorded=true; ++dispatch; try { manager.cancel(); } catch (error) { /* already terminal */ }
        setRunning(false); setPhase("stopped","STOPPED"); addMessage("INFO","Search stopped by user."); addHistory(originalSearch,timeRange.value,"stopped");
    }

    function hideOverlay() { if (!overlay) { return; } overlay.classList.remove("visible"); overlay.setAttribute("aria-hidden","true"); document.body.classList.remove("wlm-overlay-open"); }

    function finishSearch() {
        if (!dispatch || stopped || rejected || completionRecorded || phase === "resetting") { return; }
        completionRecorded = true;
        setRunning(false); setPhase("done","DONE"); text("diag-http","201 / completed"); text("diag-trigger","search:done");
        addHistory(originalSearch,timeRange.value,"admitted");
        showSuccess();
    }

    function setTab(name) {
        activeTab=name;
        ["events","statistics","messages"].forEach(function(tab) { var button=byId("park-tab-"+tab); if (button) { var selected=tab===name; button.classList.toggle("active",selected); button.setAttribute("aria-selected",selected?"true":"false"); } });
        renderResults();
    }

    function openNative() {
        var base=window.location.pathname.match(/^\/[^/]+\//); var locale=base?base[0]:"/en-US/";
        var url=locale+"app/search/search?q="+encodeURIComponent("search "+(editor.value.trim()||"| makeresults"))+"&earliest="+encodeURIComponent(timeRange.value||"-15m")+"&latest=now";
        window.open(url,"_blank","noopener");
    }

    if (manager) {
        manager.on("search:start",function(properties) { if (!dispatch || phase === "resetting") { return; } setPhase("running","RUNNING"); setRunning(true); updateProgress(properties); text("diag-trigger","search:start"); });
        manager.on("search:progress",function(properties) { if (!dispatch) { return; } updateProgress(properties); inspect(properties,"search:progress","—"); var content=properties&&properties.content||{}; if (content.isDone) { finishSearch(); } });
        manager.on("search:done",function() { if (!dispatch) { return; } if (!inspect(Array.prototype.slice.call(arguments),"search:done","—")) { finishSearch(); } });
        manager.on("search:error",function() { if (!dispatch) { return; } setRunning(false); if (!inspect(Array.prototype.slice.call(arguments),"search:error","—")) { completionRecorded=true; setPhase("failed","FAILED"); addMessage("ERROR","Search manager reported an error."); } });
        manager.on("search:fail",function() { if (!dispatch) { return; } setRunning(false); if (!inspect(Array.prototype.slice.call(arguments),"search:fail","—")) { completionRecorded=true; setPhase("failed","FAILED"); addMessage("ERROR","Search failed."); } });
        var resultData=getManagerData("results",{count:100});
        if (resultData) { resultData.on("data",function() { if (!dispatch) { return; } normalizeResults(resultData.data()); renderResults(); finishSearch(); }); resultData.on("error",function() { if (dispatch) { addMessage("ERROR","Unable to load results."); } }); }
    }

    $(document).off("ajaxError.parkSearch").on("ajaxError.parkSearch",function(event,xhr,settings) {
        var url=settings&&settings.url?settings.url.split("?")[0]:""; var method=settings&&(settings.type||settings.method)||"";
        var own=/\/servicesNS\/[^/]+\/wlm_magic_word\/search\/v2\/jobs\/?$/i.test(url);
        if (String(method).toUpperCase()!=="POST"||!own) { return; }
        text("diag-http",xhr&&xhr.status||"400");
        if (!inspect(xhr,"HTTP search creation",xhr&&xhr.status||"400")) { setRunning(false); setPhase("failed","FAILED"); addMessage("ERROR","Search creation failed with HTTP "+(xhr&&xhr.status||"error")+"."); }
    });

    if (runButton) { runButton.addEventListener("click",runSearch); }
    if (stopButton) { stopButton.addEventListener("click",stopSearch); }
    if (editor) { editor.addEventListener("input",function(){restoreButton.disabled=editor.value===originalSearch;}); editor.addEventListener("keydown",function(event){if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){event.preventDefault();runSearch();}}); }
    if (restoreButton) { restoreButton.addEventListener("click",function(){editor.value=originalSearch;restoreButton.disabled=true;}); }
    byId("park-open-native").addEventListener("click",openNative);
    byId("park-tab-events").addEventListener("click",function(){setTab("events");});
    byId("park-tab-statistics").addEventListener("click",function(){setTab("statistics");});
    byId("park-tab-messages").addEventListener("click",function(){setTab("messages");});
    byId("park-clear-history").addEventListener("click",function(){history=[];saveHistory();renderHistory();});
    byId("park-quiet").addEventListener("click",function(){quietMode=!quietMode;writePreference("parkProfessionalMode",quietMode?"on":"off");this.textContent="Professional mode: "+(quietMode?"on":"off");this.setAttribute("aria-pressed",quietMode?"true":"false");if(quietMode){hideOverlay();hideSuccess();}});
    byId("park-diagnostics-toggle").addEventListener("click",function(){var panel=byId("park-diagnostics");var open=panel.hasAttribute("hidden");if(open){panel.removeAttribute("hidden");}else{panel.setAttribute("hidden","hidden");}this.setAttribute("aria-expanded",open?"true":"false");});
    byId("park-close-overlay").addEventListener("click",hideOverlay);
    byId("park-sound").addEventListener("click",function(){playPattern(activeTheme);});
    overlay.addEventListener("click",function(event){if(event.target===overlay){hideOverlay();}});
    document.addEventListener("keydown",function(event){if(event.key==="Escape"){hideOverlay();hideSuccess();}});
    document.addEventListener("pointerdown",armAudio,{once:true});

    byId("park-quiet").textContent="Professional mode: "+(quietMode?"on":"off");
    byId("park-quiet").setAttribute("aria-pressed",quietMode?"true":"false");
    text("diag-phase",phase); text("diag-updated",nowLabel());
    renderHistory(); renderResults();
});
