# WLM Magic Word

An installable Splunk app that safely simulates workload-management admission decisions. It provides a memorable, original dinosaur-hacker homage without using movie footage, dialogue audio, or other external media.

## Install

1. In Splunk Web, open **Apps > Manage Apps > Install app from file**.
2. Upload `wlm_magic_word-1.0.0.spl`.
3. Restart Splunk if prompted.
4. Open the in-app **README** dashboard to choose the correct workflow.
5. Use **Live WLM Test** only for scoped lab validation of an actual admission rule.

For a lab CLI install:

```bash
$SPLUNK_HOME/bin/splunk install app wlm_magic_word-1.0.0.spl -auth admin:YOUR_PASSWORD
```

## Which dashboard should I use?

| Dashboard | Purpose | Dispatches searches? | Recommended use |
| --- | --- | --- | --- |
| **README** | In-app orientation and safety guidance | No | Start here and choose the appropriate workflow. |
| **Park Search** | Primary search workspace with results, messages, history, diagnostics, success toast, and WLM overlays | Yes | Day-to-day demonstrations and the complete user experience. |
| **WLM Magic Word** | Theme gallery and simulator | No | Preview denial themes, remediation guidance, icons, colors, sounds, and the admitted state without requiring a real rejection. |
| **Live WLM Test** | Minimal Simple XML compatibility and regression harness | Yes | Validate real WLM callbacks, response formats, Filter Search behavior, and repeated dispatches after Splunk or app changes. |

The recommended workflow is **preview in WLM Magic Word → validate a scoped rule in Live WLM Test → demonstrate the complete experience in Park Search**. Live WLM Test is intentionally a lab tool, not the primary search interface.

## Safe WLM admission-rule setup

Use a dedicated lab user such as `wlm_demo`. In Splunk Web, go to **Settings > Workload Management > Admission Rules**, select **Add Admission Rule**, enter one of the predicates below, choose **Filter search**, paste the exact user message, configure the intended schedule, and enable the rule. Test one recipe at a time, then disable or delete the temporary rule.

| Theme | Predicate | User message | Harmless validation |
| --- | --- | --- | --- |
| WILDCARD | `user=wlm_demo AND index=*` | `WLM-DENIED:WILDCARD: Specify one or more explicit indexes.` | Run `index=* | head 1`. |
| ALLTIME | `user=wlm_demo AND search_time_range=alltime` | `WLM-DENIED:ALLTIME: Select a bounded time range.` | Run `index=_internal | head 1` with **All time** selected. Prefer a small dedicated test index when available. |
| DEFAULT | `user=wlm_demo` | `WLM-DENIED: This test search violates the temporary admission rule.` | Run `| makeresults`. Enable this broad test-user rule only during validation. |

Replace `wlm_demo` with the exact dedicated lab username. Do not target an administrator, shared account, or production role. Start with the harmless test, confirm the expected overlay in **Live WLM Test**, repeat in **Park Search**, remove the rule, and confirm the same search is admitted.

The JOIN, CONCURRENCY, RUNTIME, and REALTIME visual themes are available for existing policies, but are not documented here as portable admission-rule predicates. Concurrency and runtime commonly depend on workload state or monitoring rules, while reliable JOIN and real-time identification can vary by version and local policy.

## Live WLM hook

The **Live WLM Test** page dispatches the SPL you explicitly submit and listens to that search manager's `search:error`, `search:fail`, and job-message streams. The preferred trigger is the exact `WLM-DENIED:` marker; broader WLM/admission/rejection wording remains available as a fallback.

Validated Splunk 10.2.x response:

```json
{"messages":[{"type":"FATAL","text":"WLM-DENIED: This search violates an admission rule. Please refine the search and try again."}]}
```

Configure the admission rule's user message to begin with `WLM-DENIED:` so the browser can distinguish it from unrelated pre-dispatch search failures.

Version 0.4 extracts only recognized message fields from the SplunkJS callback. It never serializes the complete search manager, application context, session metadata, or configuration object into the popup.

## Version 0.5 themes and sound

Version 0.5 adds automatic locally synthesized sound, a persistent mute toggle, themed denial responses, remediation guidance, and a short success toast for admitted searches. Browser autoplay policies require one user interaction; clicking Submit arms the audio context for the later rejection response.

Use structured admission messages to select a theme:

```text
WLM-DENIED:WILDCARD: Specify one or more explicit indexes.
WLM-DENIED:ALLTIME: Select a bounded time range.
WLM-DENIED:JOIN: Replace join with stats, lookup, or a narrower subsearch.
WLM-DENIED:CONCURRENCY: The concurrent-search allowance is full.
WLM-DENIED:RUNTIME: Schedule or optimize this long-running search.
WLM-DENIED:REALTIME: Evaluate scheduled or indexed real-time detection.
```

Plain `WLM-DENIED:` messages continue to use the default dinosaur theme.

## Version 0.6 filter and rerun support

Version 0.6 adds a dedicated **Run / Rerun Search** button. It reads the current SPL and time picker values, updates the search manager directly, and dispatches even when the inputs have not changed. The built-in Simple XML Submit button is removed.

The app also observes the rendered results panel for `WLM-DENIED:` messages. This covers the **Filter Search** admission-rule path, while the existing `search:error` and `search:fail` listeners continue to cover **Reject Search** and pre-SID failures.

## Version 0.7 completion handling

Version 0.7 resets **Run / Rerun Search** through three compatible completion paths: `search:done`, the `search:progress` `isDone` flag, and arrival of results data. WLM errors and rendered filter messages also reset the control. This addresses Splunk 10.2.7 Simple XML cases where results render without a reliable `search:done` callback.

## Version 0.8 message extraction

Version 0.8 selects the smallest rendered text node containing `WLM-DENIED:` instead of reading the entire results panel. This prevents result headers, timestamps, and result values from being appended to the popup message when a Filter Search rule displays an inline warning alongside valid results.

## Version 0.9 repeated identical denials

Version 0.9 suppresses the previous rendered warning while a new run is starting, then intentionally re-evaluates the panel at the completion of that dispatch. The same Filter Search rule and identical `WLM-DENIED:` text can therefore trigger the popup on every run without reopening a stale message before the new request completes.

## Version 0.10 fresh dispatch after denial

Version 0.10 explicitly cancels the prior SearchManager job, waits for the cancellation lifecycle to settle, reapplies the current SPL and time range, and then starts a fresh search. A generation guard prevents rapid repeated clicks from launching an older queued restart. This addresses Splunk 10.2.x Filter Search denials that leave the manager attached to a terminal job and otherwise ignore a same-SPL rerun.

## Version 0.11 denial completion isolation

Version 0.11 ignores completion callbacks emitted while the previous job is being cancelled, resets completion state immediately before the replacement dispatch, and associates delayed panel inspection with that dispatch generation. It also inspects each new `search:progress` and `search:done` payload for the WLM marker, so repeated identical denials do not depend on Splunk changing the rendered warning text.

## Version 0.12 repeated pre-SID HTTP failures

Version 0.12 observes the narrowly scoped search-creation request used by this app. Splunk 10.2.x returns a fresh HTTP 400 containing the WLM JSON on every identical rejected dispatch, even when SearchManager does not emit another high-level `search:error` callback. The app now reads that per-request failure and de-duplicates overlapping callback paths so each click produces exactly one popup and sound.

## Version 0.13 theme gallery

Version 0.13 makes the **WLM Magic Word** simulation dashboard the canonical theme gallery. It now previews the same DEFAULT, WILDCARD, ALLTIME, JOIN, CONCURRENCY, RUNTIME, and REALTIME messages, remediation guidance, colors, icons, and synthesized sounds used by **Live WLM Test**, plus the admitted state. The fixed WILDCARD-only preview button has been removed from the live dashboard so that page stays focused on real WLM responses.

## Version 0.14 Park Search

Version 0.14 adds **Park Search**, a native-feeling search workspace with a multiline SPL editor, time presets, Run and Stop controls, job status, SID/runtime/event/result indicators, Events/Statistics/Messages tabs, browser-session history, original-search restoration, and an **Open in Search & Reporting** handoff. It uses the proven app-scoped HTTP rejection listener for repeatable pre-SID WLM failures and retains every structured theme, remediation, and synthesized sound.

Professional mode keeps WLM feedback inline without opening the theatrical overlay. A diagnostics drawer exposes the app version, dispatch number, lifecycle phase, HTTP outcome, trigger path, detected marker, and last update time so lifecycle issues can be investigated without immediately capturing a HAR. **Live WLM Test** remains as the smaller raw validation harness.

## Version 0.15 admitted-search celebration and history contrast

Version 0.15 adds a **CLEVER SEARCH!** modal whenever a newly dispatched search completes without a WLM admission denial. It shows the runtime and result count, plays a short locally synthesized success cue when automatic sound is enabled, and can be dismissed with its button, the close control, the backdrop, or Escape. Each rerun is treated as a new dispatch, so another successful completion can celebrate again. Professional mode intentionally suppresses the modal and sound while still recording the admitted result.

Session History now uses explicit high-contrast code styling that overrides Splunk Web's global inline-code colors. Its wider cards wrap long SPL across two lines and use green, red, or amber outcome rails for admitted, denied, and stopped searches.

## Version 0.16 consistent admitted-search toast

Version 0.16 replaces Park Search's full-screen admitted-search modal with the compact success toast used by Live WLM Test. Both dashboards now present the same message—**✓ CLEVER SEARCH  Admitted by workload policy  1 result · 0.07s**—using the actual result count and runtime for the completed dispatch. WLM denials continue to use the full themed overlay. Park Search Professional mode suppresses the success toast while retaining status, results, and session history.

## Version 0.17 dashboard guide and result-value isolation

Version 0.17 adds an in-app **README** dashboard explaining what each page does, which pages dispatch searches, the recommended workflow, and the lab safety boundary.

Live WLM Test no longer treats a `WLM-DENIED:` string found inside a returned table value as a rejection of the current search. This prevents searches such as `index=_internal` from replaying an older WLM log event as a new popup. Current-dispatch HTTP failures, SearchManager errors, job messages, and rendered Filter Search warnings outside result cells remain eligible detection paths.

## Version 0.18 strict rendered-warning isolation

Version 0.18 removes the rendered-panel ancestor fallback that could recombine an excluded result row through its parent container. Live WLM Test now considers only individual non-result text nodes for rendered Filter Search warnings. A historical `WLM-DENIED:` event returned by `index=_internal` therefore remains ordinary search data even when its parent visualization contains the marker in aggregate. Current-dispatch HTTP, SearchManager, and job-message paths are unchanged.

## Version 0.19 WLM setup lab

Version 0.19 keeps the Park Search feature set stable and expands the in-app **README** into a practical setup lab. It provides the Workload Management navigation path, dedicated-user guidance, Filter Search configuration steps, exact theme messages, deterministic WILDCARD and ALLTIME recipes, a temporary DEFAULT recipe, validation steps, cleanup checks, and an explicit distinction between portable admission examples and environment-dependent advanced themes.

For a safe validation, create a temporary lab admission rule that targets a dedicated test user or a distinctive, harmless search. `| makeresults` is appropriate for the broad DEFAULT test, but it does not provide an index-backed event time range and therefore is not a valid ALLTIME test. For ALLTIME, use a small dedicated test index or `index=_internal | head 1` with the time picker set to **All time**. Do not prove the feature by intentionally consuming excessive resources.

## Version 0.20 Splunk 10.4 visual compatibility and permissions

Version 0.20 adds a cache-busted compatibility stylesheet to every dashboard. It restores readable contrast for headings, instructions, recipe cards, code samples, and supporting text under Splunk Enterprise 10.4.3, and adds consistent horizontal gutters so dashboard content no longer sits against the panel border.

The packaged app grants all authenticated Splunk roles read access to its dashboards while reserving write access for the `admin` role. This lets users run or preview the app without allowing them to edit its shared dashboard definitions. Search and WLM capabilities remain governed by each user's existing Splunk roles and capabilities.

Version 0.20.1 narrows the setup-card title selector so emphasized phrases inside the instructions remain inline. This keeps punctuation attached to “Add Admission Rule.” and “Filter search,” instead of placing the punctuation on separate lines.

Version 0.20.2 restores readable contrast in the **Live WLM Test** native results table on Splunk Enterprise 10.2 and 10.4. The compatibility rules are scoped to that table and cover headers, result cells, alternating rows, links, empty states, and pagination without changing the dark app chrome or overlay.

Version 0.20.3 handles Splunk versions that do not expose the SearchManager `messages` data source, preventing the optional job-message listener from aborting dashboard JavaScript. WLM detection continues through search callbacks, current-dispatch HTTP failures, and rendered Filter Search warnings. It also restores dark-on-light contrast and spacing in the WLM Magic Word talk-notes panel and includes the standard Splunk app logo/icon assets.

Version 0.20.4 removes registration of the unsupported SearchManager `messages` data source entirely. Some Splunk builds defer creation of that model until a job starts, so an initial `try/catch` could not prevent the later exception. Live WLM Test and Park Search retain result data, search lifecycle callbacks, current-dispatch HTTP rejection inspection, and rendered-warning detection. Versioned JavaScript filenames force clients to load the corrected lifecycle code after upgrading.

Version 0.20.5 corrects the ALLTIME validation recipe. Generating searches such as `| makeresults` are not index-backed and may be admitted even when the dashboard time picker is set to **All time**. The setup guide now uses `index=_internal | head 1` as the readily available lab fallback and recommends a small dedicated test index when one exists. `| makeresults` remains the harmless test for the broad DEFAULT rule.

Version 0.20.6 restores the intended Diagnostics toggle behavior in Park Search. The dashboard's grid declaration had overridden the HTML `hidden` state, causing diagnostics to appear as an unexplained footer from initial page load. A cache-busted stylesheet now keeps the drawer hidden until requested and gives the open drawer a labeled, high-contrast heading.

Version 0.20.7 preserves generating-command SPL when handing a query from Park Search to Search & Reporting. Searches beginning with `|`, such as `| makeresults`, are passed through unchanged; ordinary event searches continue to receive the explicit `search` command. A versioned JavaScript filename prevents an older handoff function from remaining in the browser cache after upgrade.

Version 0.20.8 makes the shared sound preference explicit. **Auto sound** is renamed **App sound** in Live WLM Test, and Park Search now provides the same toggle. Both controls use the existing browser-local app preference, initialize from its current value, and synchronize when the setting changes in another open tab. Manual **Play the warning** controls remain available when automatic app sound is off.

## Version 1.0.0 first public release

Version 1.0.0 promotes the validated 0.20.8 feature set to the first public release. It includes the Park Search workspace, WLM theme gallery, Live WLM Test regression harness, in-app setup guide, structured denial themes, repeated-dispatch handling, shared sound preference, Splunk 10.2 and 10.4 compatibility styling, and read-for-all/write-for-admin dashboard permissions.

The live hook is scoped to searches launched from this app. It does not intercept Search & Reporting or other apps. A system-wide visual would require modifying another app's JavaScript or using a managed browser extension, both of which have a larger support and upgrade surface.

## Safety boundary

- The simulation page dispatches no searches. The Live WLM Test page dispatches only the SPL explicitly submitted by the user.
- The app does not create or modify WLM rules.
- The app does not modify Splunk Web core files.
- The sound is synthesized locally with the browser Web Audio API.
- Validate actual admission rules separately in a non-production environment.

## Demo scenarios

- Unbounded wildcard search
- Resource-heavy join
- User concurrency limit
- Estimated-runtime policy
- Well-scoped admitted search

## If the real rejection is not detected

Splunk versions and rule configurations can produce different message text. Capture the exact browser-visible rejection or the search job message and add a narrow signature to `appserver/static/wlm_live_test.js`; avoid matching every generic search error.

## Compatibility

Built as a Classic Simple XML dashboard with static JavaScript and CSS. Test in your target Splunk Enterprise version before presenting; browser content-security and dashboard-framework behavior may vary by release.
