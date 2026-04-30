# VoiceAgent -- Test Scenarios

## How to test
- Call the Vapi assistant phone number
- Follow the scenario script
- After each call: check Airtable (customers, appointment_logs, call_logs) and Google Calendar

---

## 1. New client -- full booking (happy path)

**Goal:** New client books a lawn mowing appointment.

1. Call in. Sophie greets without name (phone not in CRM).
2. Say: "I'd like to book a lawn mowing appointment."
3. Sophie asks for email. Provide: `testuser1@example.com`
4. Sophie searches CRM -- not found. Asks for name.
5. Spell: "John Smith"
6. Sophie creates client, asks for details (address, date/time).
7. Provide valid future date, address in service area.
8. Sophie checks availability, offers slots, books.
9. Sophie confirms appointment details, wraps up.

**Verify:**
- customers: new record with email, full_name, phone (E.164)
- appointment_logs: new record with status=scheduled, customer linked
- Google Calendar: event created with correct time, attendee email
- call_logs: record with summary, outcome, cost, customer linked

---

## 2. Returning client by phone (auto-lookup)

**Goal:** Known client is recognized by phone number.

1. Call from the phone number stored in CRM for an existing client.
2. Sophie greets by name (phone lookup succeeds).
3. Say: "I just have a quick question about your services."
4. Sophie answers from knowledge base.

**Verify:**
- No new records created in customers or appointment_logs
- call_logs: record created

---

## 3. Returning client -- reschedule

**Goal:** Existing client reschedules an appointment.

1. Call in, get identified (phone or email).
2. Say: "I need to reschedule my appointment."
3. Sophie looks up appointments, confirms which one.
4. Provide new date/time.
5. Sophie checks availability, updates event.

**Verify:**
- appointment_logs: status changed to "rescheduled"
- Google Calendar: event updated with new time
- call_logs: record with summary mentioning reschedule

---

## 4. Cancel appointment

**Goal:** Client cancels an existing appointment.

1. Call in, get identified.
2. Say: "I need to cancel my appointment."
3. Sophie finds appointment, asks for confirmation.
4. Confirm: "Yes, please cancel it."
5. Sophie deletes event, confirms cancellation.

**Verify:**
- appointment_logs: status changed to "canceled"
- Google Calendar: event deleted
- call_logs: record created

---

## 5. General question from knowledge base

**Goal:** Caller asks about services/hours without needing CRM.

1. Call in.
2. Ask: "What services do you offer?" or "What are your business hours?"
3. Sophie answers from KB without asking for email.
4. Ask: "That's all, thanks."

**Verify:**
- No customer/appointment records created
- call_logs: record created
- Sophie did NOT ask for email or try CRM lookup

---

## 6. Out-of-area caller

**Goal:** Caller provides address outside service area.

1. Call in, go through identification as new client.
2. When asked for address, provide one outside service area.
3. Sophie checks KB, informs caller area is not serviced.
4. Sophie offers callback or alternative.

**Verify:**
- Customer created but no appointment booked
- Sophie handled gracefully

---

## 7. Out-of-hours booking attempt

**Goal:** Caller tries to book outside business hours.

1. Call in, get identified.
2. Request appointment on Sunday or at 11 PM.
3. Sophie checks KB for hours, informs caller it's outside hours.
4. Sophie suggests nearest valid time.

**Verify:**
- No event created for invalid time
- Sophie offered alternative within business hours

---

## 8. Invalid email -- retry (input validation)

**Goal:** LLM sends invalid email, workflow asks to retry.

1. Call in.
2. When asked for email, say something ambiguous that LLM might misinterpret.
3. If workflow receives email without "@", validation_error returns instruction.
4. Sophie asks caller to repeat email.

**Verify:**
- No customer created with invalid email
- Sophie re-asked for email naturally

---

## 9. Service not in KB -- escalation

**Goal:** Caller asks for a service not listed in knowledge base.

1. Call in.
2. Say: "I need help with pool installation."
3. Sophie searches KB, doesn't find match.
4. Sophie explains politely, offers callback from the team.

**Verify:**
- Sophie did not invent pricing or details
- Callback was offered
- call_logs: record created

---

## 10. Double booking attempt (idempotency)

**Goal:** Same booking request sent twice doesn't create duplicate.

1. Book an appointment (scenario 1).
2. Immediately try to book the exact same time + email again.
3. Sophie should return "This appointment already exists" with the existing ID.

**Verify:**
- Google Calendar: only ONE event exists
- appointment_logs: only ONE record
- Second call returned existing appointment_id

---

## 11. Tool failure -- graceful fallback

**Goal:** External API error is handled gracefully.

1. Call in during a period when Airtable/GCal might have issues, or simulate by temporarily disabling credentials.
2. Try to book or look up an appointment.
3. Sophie should apologize and offer callback.

**Verify:**
- Sophie said something like "I'm sorry, my system is having a moment"
- Sophie offered callback
- No crash or hang

---

## 12. Silent caller -- timeout

**Goal:** Test behavior when caller doesn't respond.

1. Call in.
2. After Sophie greets, stay silent.
3. Sophie should ask "Are you still there?"
4. Stay silent again.
5. Sophie should end call politely.

**Verify:**
- Sophie asked "Are you still there?" (not immediately)
- Call ended politely after repeated silence

---

## 13. Transfer/callback request

**Goal:** Caller asks to speak to a real person.

1. Call in.
2. Say: "Can I speak to someone from your team?"
3. Sophie should NOT attempt transfer.
4. Sophie offers callback: "I can have someone call you back."
5. Confirm phone number.

**Verify:**
- No transfer attempted
- Callback offered with phone confirmation
- Sophie continued or wrapped up naturally

---

## 14. Multiple actions in one call

**Goal:** Caller books, then asks a question, then reschedules.

1. Call in, get identified.
2. Book an appointment.
3. Then ask: "What's your pricing for garden design?"
4. Then say: "Actually, can we move that appointment to next week?"
5. Sophie handles all three actions in sequence.

**Verify:**
- Appointment created, then rescheduled
- appointment_logs: status=rescheduled
- KB question answered mid-call
- Sophie remembered context throughout

---

## 15. Caller interrupts mid-response

**Goal:** Test that Sophie stops speaking when interrupted.

1. Call in.
2. While Sophie is speaking (mid-sentence), interrupt with a question.
3. Sophie should stop and respond to the interruption.

**Verify:**
- Sophie stopped mid-sentence
- Sophie addressed the new question
- Conversation continued naturally

---

## Post-test checklist

After running all scenarios, verify:

- [ ] All call_logs entries have: summary, outcome, cost, customer link
- [ ] Phone numbers in customers table are E.164 format (+1XXXXXXXXXX)
- [ ] appointment_logs have correct status values (scheduled/rescheduled/canceled)
- [ ] appointment_logs have customer linked records
- [ ] No duplicate calendar events from scenario 10
- [ ] Error handling worked in scenario 11 (no crashes)
- [ ] No tool names or system details leaked in any conversation
