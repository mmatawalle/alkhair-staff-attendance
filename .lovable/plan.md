## What's happening

The "Thank you for subscribing" message is OneSignal's built-in **Welcome Notification** — it's sent automatically by OneSignal, not by your app. Seeing it means your device is registered correctly. Good news.

The clock-in/out alerts are sent by your app's own code (in the punch handler), and nothing needs to be configured in the OneSignal dashboard for them. But that code has two bugs:

### Bug 1: the send is cancelled before it leaves the server
The punch handler fires the OneSignal request without waiting for it, then immediately returns the punch result. Your backend runs in a serverless environment that shuts the request down as soon as the response is sent — so the notification request is killed mid-flight. This is why the punch succeeds but no alert arrives.

### Bug 2: it would notify everyone, not just admins
The send targets the "Subscribed Users" segment, i.e. every registered device — so employees would get alerts about each other's punches, and admins get nothing special.

## The fix

1. **Await the notification send** inside the punch handler (with a short timeout and error logging) so it actually completes before the response returns. A punch must still succeed even if the push fails.

2. **Target admins only.** When a device subscribes, tag it with the signed-in user's ID and role via the OneSignal SDK (external ID + a `role` tag). The punch handler then sends using a filter on `role = admin` instead of the blanket segment.

3. **Store subscriptions in the database** as the reliable source of truth: a small `push_devices` table (user_id, onesignal subscription id) written when a device opts in. The punch handler looks up admin user IDs and targets those specific external IDs. This avoids relying on tags being in sync.

4. **Add a "Send test notification" button** on the Team page so you can verify delivery end-to-end without waiting for a real punch, plus surface the send result (success / error reason) instead of failing silently.

5. **Log every send attempt** server-side so failures are diagnosable.

## Notes

- Push only works on your **published HTTPS site** opened in a real browser tab — not inside the editor preview. On iPhone, the site must be added to the Home Screen first.
- Your published domain must be listed as the Site URL in the OneSignal app config (already the case if the subscribe confirmation arrived).
- Optional: I can turn off OneSignal's Welcome Notification if you don't want staff seeing it. That one **is** a dashboard setting.
