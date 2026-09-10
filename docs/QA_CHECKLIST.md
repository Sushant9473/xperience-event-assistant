# Manual interface verification

This checklist is provided for a browser walkthrough. Unchecked items are not claims of completed visual testing. Automated verification is described in the README and test suite.

## Account and navigation

- [ ] Register, sign out, sign in again, and reopen a saved event.
- [ ] A bad password produces an understandable error.
- [ ] Refresh a URL containing `?event=...` and return to the same event.
- [ ] Switch between events without mixing conversation drafts or proposals.
- [ ] Try a second account and verify the first account’s events are absent.

## Planning and assistant

- [ ] Create a blank event with unknown dates; verify no date is fabricated.
- [ ] Create both sample scenarios, inspect the initial proposal, and approve.
- [ ] Reject a proposal and verify the plan remains unchanged.
- [ ] Resend the same rejected task request; verify a fresh proposal appears and the task is created only after approving that new proposal.
- [ ] Inspect before/after values, including a relative deadline recalculation.
- [ ] Apply a manual change and verify an earlier pending proposal becomes outdated.
- [ ] Edit tasks, dependencies, assignees, priorities, vendors, capacities, and sessions.
- [ ] Try a dependency cycle or deleting a referenced record; verify the error explains the problem.
- [ ] Verify a resolved transport shortfall disappears after confirmed capacity is updated.
- [ ] In live mode, interrupt the provider connection and verify a retry control appears without a demo response.
- [ ] Verify demo free-form messages clearly explain the scripted limitation.
- [ ] Confirm event deletion only happens after the explicit confirmation dialog.

## Keyboard and assistive technology

- [ ] Complete registration using Tab, Shift+Tab, and Enter.
- [ ] Open an edit/review dialog; focus remains inside it, Escape closes it, and focus returns to the trigger.
- [ ] Move between dashboard tabs using Left/Right arrows and Home/End.
- [ ] Confirm every icon-only button has an accessible name.
- [ ] Send a message with Enter and insert a newline with Shift+Enter.
- [ ] Check that errors and save notices are announced by a screen reader.
- [ ] Confirm focus rings are visible on the navy sidebar and light controls.

## Responsive and visual

- [ ] At 1440×900, dashboard and assistant fit beside each other and scroll independently as intended.
- [ ] At 1024×768, overview panels and controls remain readable without overlap.
- [ ] At 390×844, switch between Dashboard and Assistant; verify both support the full workflow.
- [ ] At 320px width, dialogs and their footer actions remain usable.
- [ ] At 200% text enlargement, essential labels, dates, and controls do not clip.
- [ ] Long event/task/vendor names wrap or truncate appropriately and remain available in edit dialogs.
- [ ] Empty events, no dated tasks, provider errors, and loading states make the next action clear.
- [ ] Reduced-motion preference disables decorative transitions and spinners.

## Optional integration checks

- [ ] With a real Gemini key, generate a fresh free-form plan and a revision; verify both pass domain validation.
- [ ] In a browser supporting `document.modelContext`, verify both optional workspace tools register and use the visible event state.
- [ ] Build and run the Docker image; repeat registration, plan approval, and reload before any cloud publication.
