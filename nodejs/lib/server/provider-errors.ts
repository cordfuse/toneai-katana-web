// Turn Anthropic's raw error text into something a guitarist can act on.
//
// WHY THIS EXISTS — measured, not imagined. On the first full day of public
// traffic, 29 of 279 requests failed, and every single one was a BYOK user whose
// own key was rejected:
//
//   18x  "Your credit balance is too low to access the Anthropic API."
//   11x  "invalid x-api-key"
//
// Both were shown to the user verbatim. "invalid x-api-key" means nothing to
// someone who plays guitar, and the credit message does not tell them the thing
// they actually need to know: A CLAUDE PRO SUBSCRIPTION IS NOT API CREDIT. That is
// the single most common way a BYOK attempt fails, by nearly 2:1, and the raw text
// never mentions it.
//
// THE SAME PROVIDER ERROR MEANS DIFFERENT THINGS DEPENDING ON WHOSE KEY IT WAS.
// "No credit" on a user's key is a fixable mistake they can act on. "No credit" on
// the SERVER's key means the free tier is down for everybody and there is nothing
// the user can do but bring their own. Mapping without that distinction would tell
// a user to top up an account they do not own.

import { scrubString } from '@/lib/log/scrub'

export const BYOK_GUIDE_URL = 'https://github.com/cordfuse/toneai-katana-web/blob/main/BYOK.md'

export type KeyOwner = 'server' | 'user'

/** Match on the provider's message rather than a status code: the SDK surfaces
 *  these as generic errors, and the text is the only thing that distinguishes
 *  "no credit" from "bad key". Case-insensitive, and matched on substrings that
 *  are stable parts of Anthropic's wording rather than the whole sentence. */
const NO_CREDIT = /credit balance is too low|insufficient.{0,20}credit/i
const BAD_KEY = /invalid x-api-key|authentication_error|invalid.{0,10}api.{0,3}key/i
const RATE_LIMITED = /rate.?limit|429/i
const OVERLOADED = /overloaded|529/i

/**
 * @param raw       the provider's own message
 * @param keyOwner  'user' when the request carried a BYOK key — so the advice is
 *                  about THEIR account; 'server' when it ran on ours.
 */
export function mapProviderError(raw: string, keyOwner: KeyOwner): string {
  const msg = raw ?? ''

  if (NO_CREDIT.test(msg)) {
    return keyOwner === 'user'
      ? "There's no credit on that API key. A Claude Pro or Max subscription is billed " +
        'separately and does NOT include API access — you need to add credit to your ' +
        'Anthropic account (Console → Settings → Billing). The minimum is $5, which is ' +
        `roughly 150 tones. Full guide: ${BYOK_GUIDE_URL}`
      // Our key is dry. Say nothing about billing — that is not the user's problem
      // and not their account. Give them the one route that still works.
      : "The free tier is temporarily out of credit — that's on us, not you. Add your " +
        'own Anthropic API key in Settings to keep going, or try again later. ' +
        `Full guide: ${BYOK_GUIDE_URL}`
  }

  if (BAD_KEY.test(msg)) {
    return keyOwner === 'user'
      ? "That API key isn't valid. Anthropic keys start with `sk-ant-` and are only " +
        'shown once, when you create them — check for a missing character or a stray ' +
        'space, or just create a new one (it costs nothing). ' +
        `Full guide: ${BYOK_GUIDE_URL}`
      // The SERVER's key is bad. A user can do nothing about this, so don't imply
      // they can — and don't leak which env var is wrong.
      : "The free tier isn't available right now. Add your own Anthropic API key in " +
        'Settings to continue.'
  }

  if (RATE_LIMITED.test(msg)) {
    return keyOwner === 'user'
      ? "Anthropic is rate-limiting your account — that's their limit on your key, not " +
        'ours. New accounts start on a low tier and it rises as you use it. Wait a ' +
        'moment and try again.'
      : 'Too many tones at once — give it a moment and try again.'
  }

  if (OVERLOADED.test(msg)) {
    return "Anthropic's servers are busy right now. Wait a moment and try again — " +
      'nothing is wrong with your key or your request.'
  }

  // Unrecognised. Pass the provider's own words through, SCRUBBED — an unmapped
  // error is still better than a shrug, and a new failure mode should be visible
  // rather than swallowed by a generic catch-all.
  return scrubString(msg) || 'Something went wrong generating that tone. Try again.'
}
