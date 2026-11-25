# Demo runbook

How to show Aegis to a risk, compliance, or operations person in under 20 minutes.

## Before the call
The first time a simulator or local demo connector connects to a demo or sandbox tenant, it adopts that tenant's sequence if its local counter is behind, logs “Synced local sequence to remote (was X, now Y). Continuing.”, and the first story continues. A later clash (two connectors writing the same source) is still refused. A real tenant is never auto-synced.

Approval and invite email is off. `demo:up` does not send, and addresses at demo.test are never delivered. Turn mail on only when you mean to: Governance → Email, plus `AEGIS_EMAIL_ENABLED=1` in the shell.

1. Start the local stack (or use staging):
   - `pnpm bank:up` (or the equivalent for staging)
   - Confirm API, identity, console, and bank simulator are up
2. Have the demo tenant ready (Demo Bank personas).
3. Open two browser windows:
   - Console: `http://localhost:3000` (or staging URL)
   - Bank simulator: `http://localhost:4000`

## What you will show

A loan decision that needs human approval, the sealed record that proves what happened, and the evidence file an auditor can check without trusting the system.

## Steps

1. **Sign in as the officer**  
   Use the officer persona. Show the live feed is empty or quiet.

2. **Run a loan that stays under the limit**  
   In the simulator, run the “within limit” story.  
   Switch to the console. Show the case appears, the decision is allowed, and the receipt is sealed.

3. **Run a loan that needs a person**  
   In the simulator, run the “needs manager” story.  
   In the console, show the case is held.  
   Sign in as the manager (or use the approval link). Approve it.  
   Show the case is now approved and the receipt includes who approved it.

4. **Open the sealed receipt**  
   Open the case. Point to:
   - What happened
   - What data was seen
   - Which rule applied
   - Whether a person approved it  
   Download the evidence bundle. Open the Verify page and drop the file. Show it passes.

5. **Optional: show the red-team panel**  
   If the person is technical, open the simulator red-team panel and run one or two attacks. Show the system refuses the ungated action and records the refusal.

## What to say if they ask

- “This is not a loan system. It sits next to the system that already makes the decision. It records what was decided, what data was used, and who approved it, in a way that cannot be changed later.”
- “The bank keeps its own systems. Aegis only receives the event and returns a signed receipt.”
- “An auditor can check the file without logging into Aegis.”

## After the call

- Note what they asked and where they got stuck.
- If they want a sandbox, use the access-request flow and approve it from Ops.

## Local commands

- Start everything: `pnpm bank:up`
- Walk the runbook automatically: `pnpm demo:runbook-walk`
- Quickstarts: `pnpm launch:quickstarts`
