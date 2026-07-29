# Editable learning profile in Settings

Date: 2026-07-29

## Problem

The onboarding flow tells users that their role, English-learning goal, and interests can be
changed later, but the authenticated application did not provide an editor. The profile could
only be written during onboarding or by calling the API directly.

## Implementation

- Settings now loads the existing learning profile alongside model settings and presents an
  "About you" editor before the local-AI controls.
- Users can change their role, learning goal, and three-to-five interests, then persist those
  choices through the existing `PUT /api/profile` endpoint.
- After a save, Settings fetches the profile again and renders the server-confirmed state rather
  than assuming the request succeeded locally.
- Onboarding and Settings share one source of truth for built-in role, goal, and interest options.
- Existing custom values are preserved and remain editable. Matching is case-insensitive, so
  values such as `coffee` and `Coffee` do not appear twice or disappear on save.
- The profile controls use fieldset labels, pressed states, disabled save states, and a live
  status message for keyboard and assistive-technology feedback.

## Verification

- API and Web typechecks pass on Node `v24.18.0`.
- All 254 API and 17 Web Vitest cases pass. New Web coverage verifies custom-option
  preservation, case-insensitive interest toggling, and the five-interest limit.
- The Vite production build and Demo readiness preflight pass.
- Browser QA used the seeded `demo` account to change role and goal, save, reload, and confirm
  persistence. The original demo values were restored afterward.
- The Settings page renders without browser warnings or errors and keeps the profile editor in
  the first viewport.
