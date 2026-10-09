require([
    "splunkjs/mvc",
    "splunkjs/mvc/simplexml/ready!"
], function(mvc) {
    "use strict";

    var scenarios = {
        default: {
            allowed: false, code: "DEFAULT", icon: "🦖⌨", headline: "AH-AH-AH!",
            tagline: "You didn't say the magic word.", name: "deny_by_policy",
            message: "WLM-DENIED: Refine the search and try again.",
            remediation: "Refine the search and try again.", reason: "Protects shared search capacity",
            sound: [[330, .15], [247, .15], [330, .22]]
        },
        wildcard: {
            allowed: false, code: "WILDCARD", icon: "🦖✱", headline: "NOT EVERY INDEX!",
            tagline: "Objects in index=* may be larger than they appear.", name: "deny_unbounded_wildcard",
            message: "WLM-DENIED:WILDCARD: Specify one or more explicit indexes.",
            remediation: "Replace index=* with one or more explicit indexes.", reason: "Protects shared search capacity",
            sound: [[392, .11], [294, .11], [196, .28]]
        },
        alltime: {
            allowed: false, code: "ALLTIME", icon: "⏳🦴", headline: "PREHISTORIC RANGE!",
            tagline: "All time goes back a little too far.", name: "deny_all_time_range",
            message: "WLM-DENIED:ALLTIME: Select a bounded time range.",
            remediation: "Choose the smallest time range that answers the question.", reason: "Avoids unbounded historical scans",
            sound: [[440, .12], [370, .12], [294, .12], [220, .3]]
        },
        join: {
            allowed: false, code: "JOIN", icon: "🦖💥🦖", headline: "JOIN COLLISION!",
            tagline: "That join has chosen violence.", name: "deny_resource_heavy_join",
            message: "WLM-DENIED:JOIN: Replace join with a more scalable pattern.",
            remediation: "Consider stats, eventstats, lookup, or a narrower subsearch.", reason: "Prevents avoidable memory pressure",
            sound: [[180, .09], [110, .34]]
        },
        concurrency: {
            allowed: false, code: "CONCURRENCY", icon: "🦖🦖🦖", headline: "HOLD ONTO YOUR BUTTS!",
            tagline: "The search queue is already full.", name: "deny_user_concurrency",
            message: "WLM-DENIED:CONCURRENCY: Concurrent-search allowance reached.",
            remediation: "Wait for a running search to finish or review concurrency limits.", reason: "Preserves fair access for other users",
            sound: [[262, .1], [330, .1], [392, .1], [262, .26]]
        },
        runtime: {
            allowed: false, code: "RUNTIME", icon: "🦴⌨", headline: "STILL RUNNING?",
            tagline: "The dinosaurs have become fossils.", name: "deny_estimated_runtime",
            message: "WLM-DENIED:RUNTIME: Estimated runtime exceeds policy.",
            remediation: "Reduce the scope, optimize the SPL, or schedule the workload.", reason: "Keeps interactive searches responsive",
            sound: [[330, .14], [277, .18], [220, .32]]
        },
        realtime: {
            allowed: false, code: "REALTIME", icon: "🚨🦖", headline: "REAL-TIME RAMPAGE!",
            tagline: "Continuous searches continuously consume resources.", name: "deny_realtime_search",
            message: "WLM-DENIED:REALTIME: Continuous real-time search denied.",
            remediation: "Evaluate scheduled or indexed real-time detection instead.", reason: "Controls continuously consuming searches",
            sound: [[440, .09], [660, .09], [440, .09], [660, .22]]
        },
        allowed: {
            allowed: true, code: "ADMITTED", icon: "✓🦖", headline: "CLEVER SEARCH!",
            tagline: "Life finds a way.", name: "allow_scoped_search",
            message: "Scoped index, bounded time range, reasonable workload.",
            remediation: "No remediation required.", reason: "Meets the simulated admission policy",
            sound: [[392, .1], [523, .1], [659, .22]]
        }
    };

    var activeScenario = scenarios.wildcard;

    function byId(id) { return document.getElementById(id); }

    function render(key) {
        var item = scenarios[key] || scenarios.wildcard;
        var shell = byId("magic-shell");
        if (!shell) { return; }
        activeScenario = item;
        ["default", "wildcard", "alltime", "join", "concurrency", "runtime", "realtime", "allowed"].forEach(function(theme) {
            shell.classList.remove("theme-" + theme);
        });
        shell.classList.add("theme-" + key);
        shell.classList.toggle("allowed", item.allowed);
        byId("theme-icon").textContent = item.icon;
        byId("decision-status").textContent = item.allowed ? "SEARCH ADMITTED" : "SEARCH DENIED";
        byId("decision-headline").textContent = item.headline;
        byId("decision-tagline").textContent = item.tagline;
        byId("decision-message").textContent = item.message;
        byId("rule-name").textContent = item.name;
        byId("theme-marker").textContent = item.allowed ? "—" : "WLM-DENIED:" + (item.code === "DEFAULT" ? "" : item.code + ":");
        byId("rule-decision").textContent = item.allowed ? "ALLOW" : "REJECT";
        byId("rule-reason").textContent = item.reason + ". Try: " + item.remediation;
    }

    function playWarning() {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) { return; }
        var context = new AudioContext();
        var now = context.currentTime;
        var cursor = now;
        activeScenario.sound.forEach(function(note) {
            var oscillator = context.createOscillator();
            var gain = context.createGain();
            oscillator.type = activeScenario.code === "RUNTIME" ? "sine" : "square";
            oscillator.frequency.value = note[0];
            gain.gain.setValueAtTime(0.0001, cursor);
            gain.gain.exponentialRampToValueAtTime(0.08, cursor + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, cursor + note[1]);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(cursor);
            oscillator.stop(cursor + note[1] + 0.02);
            cursor += note[1] + 0.055;
        });
        window.setTimeout(function() { context.close(); }, 1000);
    }

    var submitted = mvc.Components.get("submitted");
    if (submitted) {
        submitted.on("change:scenario", function(model, value) { render(value); });
        render(submitted.get("scenario") || "wildcard");
    } else {
        render("wildcard");
    }

    var soundButton = byId("sound-button");
    if (soundButton) { soundButton.addEventListener("click", playWarning); }
});
