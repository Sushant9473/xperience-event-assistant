# Assessment walkthrough recording

Status: outline only; no video has been recorded. Aim for about five minutes. Explain the decisions in your own words and describe only behavior you actually demonstrate. The suggested narration below is a starting point.

## Before recording

1. Open https://xperience-event-assistant.onrender.com and let the free service wake up. Register a dedicated demonstration account and sign in before recording.
2. Keep only the app and GitHub README tabs visible. Close notifications and any windows containing credentials.
3. Rehearse the sequence once. Use the labeled demo scenarios for predictable responses; these use the same proposal validation and approval workflow as live Gemini. Do not describe scripted responses as live AI.
4. On a Mac, press Shift–Command–5, choose Record Selected Portion, and select your microphone under Options. Frame the browser so the text is readable. Click Record; stop from the menu bar when finished.

## 0:00–0:35 — Problem and approach

Show the home page.

Suggested narration: “Xperience helps an event manager turn changing requirements into an operational plan. My main design decision is that AI proposes changes, but the manager approves them. This keeps a conversation from silently changing bookings, tasks, or dates. I will use the clearly labeled scripted scenarios to demonstrate the workflow reliably. Free-form planning uses Gemini.”

## 0:35–2:00 — Wedding, dependencies, and deadlines

1. Click **Try wedding scenario**. In **Review proposed changes**, show the before/after values, then click **Approve & apply**. Show the three-day plan and 400 guests.
2. Expand **Try a scenario update**, click **150 guests are travelling from outside the city. Arrange accommodation and airport transfers.** Open **Review proposal** if needed, review, and approve. Show the requirements for 150 guests in **Vendors**.
3. Send the suggested **The catering team needs the final guest count one week before the wedding ceremony.** Review and approve. Show **Tasks** and the catering deadline.
4. Send the suggested **The photographer is unavailable for the Reception. What needs to be addressed?** Review and approve. Show the Reception photography risk in **Overview**.

Suggested narration: “Unknown values stay unknown until supplied. The catering deadline is stored as a rule relative to the ceremony, so it can move with the ceremony date. The photography warning points to the affected session and the work needed to resolve it.”

## 2:00–3:20 — Corporate planning and risk resolution

1. Click **All events**, then **Try corporate scenario**, and approve the initial plan. Show 200 employees over two days.
2. Under **Try a scenario update**, send **The CEO will join only on the second day. Schedule the leadership session accordingly.** Review and approve; show **Schedule**.
3. Send **The transportation vendor can only provide vehicles for 150 people.** Review and approve; show the **50-person transport shortfall** in **Overview**.
4. Open **Vendors**, edit **Transport vendor**, set **Available capacity** to `200` and **Status** to `Confirmed`, and save. Return to **Overview** and show that the shortfall cleared.

Suggested narration: “Risks are calculated from saved records, not invented by the model. Two hundred attendees minus one hundred fifty seats means fifty people need transport. For this demonstration I am entering a confirmed capacity of two hundred; the app does not make a real booking.”

## 3:20–4:05 — Rejection and persistence

1. Send the suggested **The resort has been confirmed for 200 people.** Review the proposal and click **Reject**.
2. Show in **Vendors** that **Corporate resort** was not changed to confirmed.
3. Send the same suggested prompt again. Review and click **Approve & apply**. Show the resort now confirmed.
4. Open **Activity**, show the applied change, then reload with Command–R. Show the saved plan remains.

Suggested narration: “Rejecting a proposal leaves the saved plan unchanged. The same request can be proposed again and applied after approval. MongoDB persists the event, conversation, proposal outcomes, and change history.”

## 4:05–5:00 — Architecture and tradeoffs

Open the GitHub README architecture section.

Suggested narration: “Next.js provides the interface and proxies same-origin API requests to Express. Express handles JWT cookies, ownership checks, and server-side Gemini calls. Shared TypeScript and Zod code validates operations, references, dependency cycles, and dates. Each approval checks the event revision and updates the plan and history atomically. This prevents stale proposals and duplicate application. I keep one bounded event document for a simple MVP; a larger system would need pagination, separate history storage, and shared rate limiting. Automated tests cover account isolation and proposal edge cases. This is an event-planning MVP, with no payments, real bookings, or external messaging.”

Mention one issue you can explain confidently: rejected proposals once confused later AI context; the fix makes the saved plan authoritative and includes explicit proposal outcomes. Do not claim hosted end-to-end testing unless you have performed it.

## Optional live Gemini clip

If time allows, create a separate blank event in **Live Gemini** mode. Send:

> Add one high-priority task named Confirm transport. Leave it unassigned and undated, with no dependencies or vendor links.

Review the fields, approve, and show the task. Clearly state that this clip uses live Gemini. If the provider fails, show the actionable error and retry; do not represent a demo response as live output.

## Upload and submit

1. Play back the recording to check audio, text readability, and accidental credential exposure.
2. Upload it to your chosen video/file host. Set viewing permissions so a reviewer can watch without requesting access; verify the link in a private/incognito window.
3. Add the actual video link near the top of the README. Remove the sentence saying the walkthrough is not recorded only after this is complete.
4. Verify the public GitHub repository in an incognito window. Submit its URL and the viewable video link in the assessment form, filling any additional requested details yourself.
5. Save the submission confirmation. A script or a local recording alone does not complete the video submission requirement.
