# WLM Magic Word

WLM Magic Word makes Splunk workload-management admission decisions visible, memorable, and easier to demonstrate. It combines a native-feeling search workspace, themed denial overlays, practical remediation guidance, optional synthesized sound, and a focused test harness for validating real admission rules.

The app is an original dinosaur-hacker homage. It does not include movie footage, dialogue audio, or other external media.

## What is included in 1.0.0

- **Park Search** — a search workspace with SPL and time controls, events and statistics, job messages, session history, diagnostics, admitted-search feedback, and themed WLM denial overlays.
- **WLM Magic Word** — a no-search theme gallery for safely previewing denial treatments, remediation messages, icons, colors, sounds, and the admitted state.
- **Live WLM Test** — a small Classic Simple XML harness for validating real WLM callbacks, Filter Search behavior, response formats, and repeated dispatches.
- **README dashboard** — in-app workflow guidance and safe admission-rule recipes.
- Structured themes for wildcard, all-time, join, concurrency, runtime, and real-time search conditions.
- Shared, browser-local app sound preference with manual playback controls.
- Compatibility styling for Splunk Enterprise 10.2.x and 10.4.x.

## Install

Download [`wlm_magic_word-1.0.0.spl`](https://github.com/mgalbert/wlm-magic-word/releases/download/v1.0.0/wlm_magic_word-1.0.0.spl) from the [1.0.0 release](https://github.com/mgalbert/wlm-magic-word/releases/tag/v1.0.0).

### Splunk Web

1. Open **Apps > Manage Apps**.
2. Select **Install app from file**.
3. Upload `wlm_magic_word-1.0.0.spl`.
4. Restart Splunk if prompted.
5. Open **WLM Magic Word > README**.

### Command line

```bash
$SPLUNK_HOME/bin/splunk install app wlm_magic_word-1.0.0.spl -auth admin:YOUR_PASSWORD
```

Restart Splunk if requested, then open the app in Splunk Web.

## Choose the right dashboard

| Dashboard | Purpose | Dispatches searches? | Recommended use |
| --- | --- | --- | --- |
| **README** | Orientation, safety guidance, and rule recipes | No | Start here. |
| **Park Search** | Complete WLM-aware search experience | Yes | Normal demonstrations and interactive exploration. |
| **WLM Magic Word** | Theme gallery and simulator | No | Preview the visual and audio treatments without configuring a rejection. |
| **Live WLM Test** | Compatibility and regression harness | Yes | Validate an actual admission rule in a controlled lab. |

Recommended path:

1. Preview a theme in **WLM Magic Word**.
2. Validate a scoped rule in **Live WLM Test**.
3. Demonstrate the complete experience in **Park Search**.

## Safe WLM admission-rule setup

Use a dedicated lab identity such as `wlm_demo`. Do not target an administrator, shared account, production role, or broad group of users.

In Splunk Web:

1. Go to **Settings > Workload Management > Admission Rules**.
2. Select **Add Admission Rule**.
3. Enter one of the scoped predicates below.
4. Choose **Filter search**.
5. Paste the corresponding user message exactly.
6. Select the intended schedule and enable the rule.
7. Sign in as the dedicated test user and validate the harmless search.
8. Disable or delete the temporary rule after testing.

Test only one recipe at a time.

| Theme | Predicate | User message | Harmless validation |
| --- | --- | --- | --- |
| **WILDCARD** | `user=wlm_demo AND index=*` | `WLM-DENIED:WILDCARD: Specify one or more explicit indexes.` | Run `index=* \| head 1`. |
| **ALLTIME** | `user=wlm_demo AND search_time_range=alltime` | `WLM-DENIED:ALLTIME: Select a bounded time range.` | Run `index=_internal \| head 1` with **All time** selected. Prefer a small dedicated test index when available. |
| **DEFAULT** | `user=wlm_demo` | `WLM-DENIED: This test search violates the temporary admission rule.` | Run `\| makeresults`. Enable this broad test-user rule only during validation. |

Replace `wlm_demo` with the exact dedicated username. After confirming the expected overlay, remove the rule and verify that the same harmless search is admitted.

> `| makeresults` is suitable for the broad DEFAULT recipe, but it is not an index-backed search and is not a valid test of an ALLTIME predicate.

### Additional theme messages

The app also recognizes these structured messages for policies you already operate:

```text
WLM-DENIED:JOIN: Replace join with stats, lookup, or a narrower subsearch.
WLM-DENIED:CONCURRENCY: The concurrent-search allowance is full.
WLM-DENIED:RUNTIME: Schedule or optimize this long-running search.
WLM-DENIED:REALTIME: Evaluate scheduled or indexed real-time detection.
```

Concurrency and runtime decisions commonly depend on workload state or monitoring rules. Reliable JOIN and real-time predicates can vary by Splunk version and local policy, so they are not presented as portable one-click recipes.

## How real denials are recognized

The preferred admission-rule user message begins with `WLM-DENIED:` or a structured marker such as `WLM-DENIED:WILDCARD:`. The marker lets the app distinguish a deliberate workload-policy response from an unrelated search error.

A representative Splunk 10.2.x rejection response is:

```json
{
  "messages": [
    {
      "type": "FATAL",
      "text": "WLM-DENIED: This search violates an admission rule. Please refine the search and try again."
    }
  ]
}
```

Park Search and Live WLM Test inspect only the lifecycle of searches launched from their own pages. Detection paths include current-dispatch HTTP failures, SearchManager error callbacks, and rendered Filter Search warnings. Historical `WLM-DENIED:` text returned as an ordinary result value is treated as data and does not trigger an overlay.

The app does not intercept Search & Reporting or searches launched by other Splunk apps.

## Sound and animation

- Sound is synthesized locally with the browser Web Audio API; no audio file is downloaded.
- **App sound** is a shared browser-local preference across Park Search and Live WLM Test.
- Browser autoplay policies require a user interaction before audio can play. Running a search or using a manual playback control supplies that interaction.
- Splunk's **Animation effects** accessibility preference must be enabled for the optional motion effects to appear.
- Turning off animation does not affect search execution or WLM detection.

## Diagnostics

Park Search includes a **Diagnostics** drawer for investigating lifecycle behavior without immediately collecting a HAR. It reports the app version, dispatch number, lifecycle phase, HTTP outcome, trigger path, detected marker, and last update time.

The drawer is hidden until selected and contains no password or session-token display.

## Permissions

The packaged metadata grants authenticated Splunk roles read access to the app dashboards and reserves dashboard write access for the `admin` role. The app does not grant search, index, workload-management, or administrative capabilities; those remain governed by each user's existing Splunk roles.

## Safety boundary

- The **WLM Magic Word** gallery and **README** dashboard dispatch no searches.
- Park Search and Live WLM Test dispatch only the SPL explicitly submitted by the user.
- The app does not create, enable, modify, or delete WLM rules.
- The app does not modify Splunk Web core files.
- Use a dedicated test user and harmless, bounded searches when validating a rule.
- Validate changes in a non-production environment before wider use.

## Troubleshooting

### A real rejection does not open an overlay

1. Confirm that the rule's user message starts with `WLM-DENIED:`.
2. Confirm that the current user, SPL, time range, schedule, and rule order satisfy the admission predicate.
3. Use **Live WLM Test** to reproduce the behavior.
4. Open **Diagnostics** in Park Search and review the dispatch outcome and trigger path.
5. Capture the exact current-dispatch rejection response if your Splunk release uses different wording.

Avoid broad matching of every generic search failure. Add only a narrow, verified signature when local behavior requires one.

### An ALLTIME test is admitted

Use an index-backed query such as `index=_internal | head 1` and select **All time**. Generating commands such as `| makeresults` may not carry the indexed time-range characteristics required by that predicate.

### Sound does not play

Confirm **App sound** is on, then interact with the page by running a search or selecting a manual playback control. Also check the browser's site-level audio permission.

### Motion effects do not appear

Check the Splunk user preference for **Animation effects**. The app respects that accessibility setting.

## Compatibility

WLM Magic Word 1.0.0 is built with Classic Simple XML dashboards plus app-scoped JavaScript and CSS. It has been exercised with Splunk Enterprise 10.2.7 and 10.4.3.

Dashboard-framework behavior, admission-response formats, browser policies, and local WLM configuration can vary. Test the app in the exact Splunk environment used for a demonstration or rollout.

## Scope

This release intentionally keeps the experience inside the WLM Magic Word app. Providing the same overlay throughout Splunk Web would require supported integration with each target interface or a managed browser extension, increasing the maintenance and upgrade surface.

## License

Released under the [MIT License](LICENSE).
