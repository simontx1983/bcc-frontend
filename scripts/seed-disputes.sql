-- ==========================================================================
-- seed-disputes.sql — fake §D5 disputes for visually testing the new
-- /disputes/[id] brutalist case-file surface.
--
-- Seeds five disputes visible to user 2 (BlueCollarCrypto) covering every
-- meaningful visual state of the detail page:
--
--   D1  Panel duty,  reviewing,  not voted    (ACCEPT/REJECT live, tally sealed)
--   D2  Panel duty,  reviewing,  voted accept (LOCKED state, tally sealed)
--   D3  Panel duty,  accepted   (verdict)     (verdict stamp, full tally)
--   D4  Filed by me, reviewing                (no vote panel, "ON THE FLOOR")
--   D5  Filed by me, accepted (you won)       (verdict stamp, full tally)
--
-- Each dispute also seeds the underlying disputed vote (downvote rows on
-- existing pages) and the panel assignments. Disputed voters are real
-- users so voter_name renders cleanly:
--   D1: Drice   D2: Tialuxe Tech   D3: dg   D4: Xanthar   D5: Espinosajavier
--
-- Re-runnable: a leading DELETE block matches the seeded rows by their
-- reason-text fingerprints and clears them before re-inserting.
-- ==========================================================================

-- 0) Wipe prior runs of this seed (matching by reason fingerprints — the
--    five disputes below all have unique reason prefixes that only this
--    seed produces). Safe even on a fresh DB.
DELETE FROM wp_bcc_dispute_participations
 WHERE dispute_id IN (
   SELECT id FROM wp_bcc_disputes
    WHERE reason LIKE 'This downvote landed within four minutes%'
       OR reason LIKE 'The downvote reason cites a missing photo%'
       OR reason LIKE 'Voter cited "fake numbers"%'
       OR reason LIKE 'Downvote reason claims the project never shipped%'
       OR reason LIKE 'Voter said the timeline was wrong%'
 );
DELETE FROM wp_bcc_dispute_panel
 WHERE dispute_id IN (
   SELECT id FROM wp_bcc_disputes
    WHERE reason LIKE 'This downvote landed within four minutes%'
       OR reason LIKE 'The downvote reason cites a missing photo%'
       OR reason LIKE 'Voter cited "fake numbers"%'
       OR reason LIKE 'Downvote reason claims the project never shipped%'
       OR reason LIKE 'Voter said the timeline was wrong%'
 );
DELETE FROM wp_bcc_disputes
 WHERE reason LIKE 'This downvote landed within four minutes%'
    OR reason LIKE 'The downvote reason cites a missing photo%'
    OR reason LIKE 'Voter cited "fake numbers"%'
    OR reason LIKE 'Downvote reason claims the project never shipped%'
    OR reason LIKE 'Voter said the timeline was wrong%';
DELETE FROM wp_bcc_trust_votes
 WHERE voter_user_id IN (3,4,5,6,7) AND vote_type = 2 AND page_id IN (1824, 1829);

-- 1) Disputed votes — fresh downvote rows so voter_name varies per dispute.
INSERT INTO wp_bcc_trust_votes
  (voter_user_id, page_id, category_id, vote_type, weight, status, created_at)
VALUES
  (3, 1824, 0, 2, 1.0000, 1, NOW() - INTERVAL 1 DAY),  -- Drice
  (4, 1824, 0, 2, 1.0000, 1, NOW() - INTERVAL 1 DAY),  -- Tialuxe Tech
  (5, 1824, 0, 2, 1.0000, 1, NOW() - INTERVAL 3 DAY),  -- dg
  (6, 1829, 0, 2, 1.0000, 1, NOW() - INTERVAL 5 HOUR), -- Xanthar
  (7, 1829, 0, 2, 1.0000, 1, NOW() - INTERVAL 4 DAY);  -- Espinosajavier

-- Capture the resolved vote ids for each (voter, page) into session vars.
SELECT id INTO @v1 FROM wp_bcc_trust_votes WHERE voter_user_id = 3 AND page_id = 1824 AND category_id = 0;
SELECT id INTO @v2 FROM wp_bcc_trust_votes WHERE voter_user_id = 4 AND page_id = 1824 AND category_id = 0;
SELECT id INTO @v3 FROM wp_bcc_trust_votes WHERE voter_user_id = 5 AND page_id = 1824 AND category_id = 0;
SELECT id INTO @v4 FROM wp_bcc_trust_votes WHERE voter_user_id = 6 AND page_id = 1829 AND category_id = 0;
SELECT id INTO @v5 FROM wp_bcc_trust_votes WHERE voter_user_id = 7 AND page_id = 1829 AND category_id = 0;

-- 2) The five disputes. Resolver of @d1..@d5 lets the panel-assignment
--    INSERTs reference them by name.

-- D1 — PANEL DUTY, REVIEWING, you haven't voted yet.
INSERT INTO wp_bcc_disputes
  (vote_id, page_id, reporter_id, voter_id, reason, evidence_url,
   status, panel_accepts, panel_rejects, panel_size, created_at)
VALUES
  (@v1, 1824, 10, 3,
   'This downvote landed within four minutes of the page going live and the voter has never engaged with the topic. Reads like coordinated retaliation, not a substantive review.',
   'https://example.com/audit/D1-thread.txt',
   'reviewing', 0, 0, 5, NOW() - INTERVAL 32 MINUTE);
SET @d1 = LAST_INSERT_ID();

-- D2 — PANEL DUTY, REVIEWING, you voted ACCEPT (LOCKED state).
INSERT INTO wp_bcc_disputes
  (vote_id, page_id, reporter_id, voter_id, reason, evidence_url,
   status, panel_accepts, panel_rejects, panel_size, created_at)
VALUES
  (@v2, 1824, 10, 4,
   'The downvote reason cites a missing photo we already linked to in the second paragraph. Pretty clearly a drive-by — never opened the page.',
   NULL,
   'reviewing', 1, 0, 5, NOW() - INTERVAL 2 HOUR);
SET @d2 = LAST_INSERT_ID();

-- D3 — PANEL DUTY, ACCEPTED. The panel agreed; downvote was struck.
INSERT INTO wp_bcc_disputes
  (vote_id, page_id, reporter_id, voter_id, reason, evidence_url,
   status, panel_accepts, panel_rejects, panel_size, created_at, resolved_at)
VALUES
  (@v3, 1824, 10, 5,
   'Voter cited "fake numbers" but the spec sheet PDF (linked) ships from the manufacturer with the same figures we quoted. Bad-faith downvote.',
   'https://example.com/audit/D3-spec.pdf',
   'accepted', 4, 1, 5,
   NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 1 HOUR);
SET @d3 = LAST_INSERT_ID();

-- D4 — FILED BY YOU (user 2), REVIEWING. Three of five panelists in.
INSERT INTO wp_bcc_disputes
  (vote_id, page_id, reporter_id, voter_id, reason, evidence_url,
   status, panel_accepts, panel_rejects, panel_size, created_at)
VALUES
  (@v4, 1829, 2, 6,
   'Downvote reason claims the project never shipped — the github releases page lists three tagged builds in the last six weeks. Verifiably false.',
   'https://example.com/audit/D4-releases.html',
   'reviewing', 2, 1, 5, NOW() - INTERVAL 4 HOUR);
SET @d4 = LAST_INSERT_ID();

-- D5 — FILED BY YOU, ACCEPTED. Verdict landed in your favor.
INSERT INTO wp_bcc_disputes
  (vote_id, page_id, reporter_id, voter_id, reason, evidence_url,
   status, panel_accepts, panel_rejects, panel_size, created_at, resolved_at)
VALUES
  (@v5, 1829, 2, 7,
   'Voter said the timeline was wrong but the on-chain timestamps from the linked tx history confirm exactly what we wrote. Asking the panel to reset.',
   'https://example.com/audit/D5-tx-history.txt',
   'accepted', 4, 1, 5,
   NOW() - INTERVAL 3 DAY, NOW() - INTERVAL 1 DAY);
SET @d5 = LAST_INSERT_ID();

-- 3) Panel assignments. UQ on (dispute_id, panelist_user_id).

-- D1: user 2 (you) NOT voted; rest of panel also pending.
INSERT INTO wp_bcc_dispute_panel
  (dispute_id, panelist_user_id, decision, voted_at, assigned_at)
VALUES
  (@d1, 2, NULL, NULL, NOW() - INTERVAL 30 MINUTE),
  (@d1, 5, NULL, NULL, NOW() - INTERVAL 30 MINUTE),
  (@d1, 6, NULL, NULL, NOW() - INTERVAL 30 MINUTE),
  (@d1, 7, NULL, NULL, NOW() - INTERVAL 30 MINUTE),
  (@d1, 8, NULL, NULL, NOW() - INTERVAL 30 MINUTE);

-- D2: user 2 voted ACCEPT 90 minutes ago; the others still pending.
INSERT INTO wp_bcc_dispute_panel
  (dispute_id, panelist_user_id, decision, voted_at, assigned_at)
VALUES
  (@d2, 2, 'accept', NOW() - INTERVAL 90 MINUTE, NOW() - INTERVAL 2 HOUR),
  (@d2, 5, NULL,     NULL,                       NOW() - INTERVAL 2 HOUR),
  (@d2, 6, NULL,     NULL,                       NOW() - INTERVAL 2 HOUR),
  (@d2, 7, NULL,     NULL,                       NOW() - INTERVAL 2 HOUR),
  (@d2, 8, NULL,     NULL,                       NOW() - INTERVAL 2 HOUR);

-- D3: full panel voted, 4 accept, 1 reject.
INSERT INTO wp_bcc_dispute_panel
  (dispute_id, panelist_user_id, decision, voted_at, assigned_at)
VALUES
  (@d3, 2, 'accept', NOW() - INTERVAL 1 DAY,   NOW() - INTERVAL 2 DAY),
  (@d3, 5, 'accept', NOW() - INTERVAL 23 HOUR, NOW() - INTERVAL 2 DAY),
  (@d3, 6, 'accept', NOW() - INTERVAL 18 HOUR, NOW() - INTERVAL 2 DAY),
  (@d3, 7, 'accept', NOW() - INTERVAL 8 HOUR,  NOW() - INTERVAL 2 DAY),
  (@d3, 8, 'reject', NOW() - INTERVAL 2 HOUR,  NOW() - INTERVAL 2 DAY);

-- D4: filed-by-you. Panel does NOT include user 2 (reporter can't vote on
--     own dispute). Three votes in, two pending.
INSERT INTO wp_bcc_dispute_panel
  (dispute_id, panelist_user_id, decision, voted_at, assigned_at)
VALUES
  (@d4, 5, 'accept', NOW() - INTERVAL 3 HOUR, NOW() - INTERVAL 4 HOUR),
  (@d4, 6, 'accept', NOW() - INTERVAL 1 HOUR, NOW() - INTERVAL 4 HOUR),
  (@d4, 7, 'reject', NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 4 HOUR),
  (@d4, 8, NULL,     NULL,                    NOW() - INTERVAL 4 HOUR),
  (@d4, 9, NULL,     NULL,                    NOW() - INTERVAL 4 HOUR);

-- D5: filed-by-you, resolved (won). Full panel voted.
INSERT INTO wp_bcc_dispute_panel
  (dispute_id, panelist_user_id, decision, voted_at, assigned_at)
VALUES
  (@d5, 5, 'accept', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 3 DAY),
  (@d5, 6, 'accept', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 3 DAY),
  (@d5, 7, 'accept', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 3 DAY),
  (@d5, 8, 'accept', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 3 DAY),
  (@d5, 9, 'reject', NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 3 DAY);

-- 4) Participation rows for the §D5 trust accounting. Only seed for the
--    one resolved dispute where user 2 voted on the winning side — that
--    powers the participation strip on /disputes meaningfully.
INSERT INTO wp_bcc_dispute_participations
  (user_id, dispute_id, decision, was_credited, outcome_match, created_at)
VALUES
  (2, @d3, 'accept', 1, 1, NOW() - INTERVAL 1 DAY);

-- 5) Verification — print what was just seeded.
SELECT
  d.id          AS dispute_id,
  d.status,
  d.reporter_id,
  d.voter_id,
  d.page_id,
  d.panel_accepts,
  d.panel_rejects,
  d.panel_size,
  CONCAT(SUBSTRING(d.reason, 1, 60), '…') AS reason_preview,
  d.created_at,
  d.resolved_at
FROM wp_bcc_disputes d
WHERE d.id IN (@d1, @d2, @d3, @d4, @d5)
ORDER BY d.id;

SELECT
  dp.dispute_id,
  dp.panelist_user_id AS user_id,
  u.user_login,
  dp.decision,
  dp.voted_at
FROM wp_bcc_dispute_panel dp
JOIN wp_users u ON u.ID = dp.panelist_user_id
WHERE dp.dispute_id IN (@d1, @d2, @d3, @d4, @d5)
ORDER BY dp.dispute_id, dp.panelist_user_id;
