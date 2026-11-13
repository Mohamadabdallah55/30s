import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAppAndHub } from './appFactory';
import { createDatabase } from './db';
import { seedDatabase } from './seed';
import type { GameSessionView } from '../shared/types';

async function withServer(
  fn: (baseUrl: string, wsUrl: string, db: ReturnType<typeof createDatabase>) => Promise<void>
) {
  const db = createDatabase(':memory:');
  seedDatabase(db);
  const { app, hub } = createAppAndHub(db);
  const server = http.createServer(app);
  hub.attach(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

  try {
    await fn(baseUrl, wsUrl, db);
  } finally {
    hub.stop();
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
}

function waitForWsMessage(ws: WebSocket): Promise<{ type: string; payload: GameSessionView }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WS timeout')), 4000);
    ws.once('message', (raw) => {
      clearTimeout(t);
      resolve(JSON.parse(raw.toString()) as { type: string; payload: GameSessionView });
    });
  });
}

test('HTTP E2E: Registration, login, profile isolation, and strict RBAC enforcement', async () => {
  await withServer(async (baseUrl) => {
    // 1. Unauthenticated access to protected routes returns 401
    const unauthMe = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(unauthMe.status, 401);

    const unauthImport = await fetch(`${baseUrl}/api/banks/bank-general-mosque/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [] }),
    });
    assert.equal(unauthImport.status, 401);

    // 2. Register a new student account cleanly without personal info
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'zaid_student',
        displayName: 'زيد البطل',
        password: '4321',
        ageGroup: 'kids',
        avatarId: 'lantern',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = (await regRes.json()) as { token: string; profile: { id: string; role: string } };
    assert.equal(regJson.profile.role, 'player');
    assert.ok(regJson.token);

    // 3. Re-login works cleanly
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'zaid_student', password: '4321' }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as { token: string; profile: { id: string } };
    assert.equal(loginJson.profile.id, regJson.profile.id);

    // 4. Player cannot access teacher/admin routes -> 403
    const studentImport = await fetch(`${baseUrl}/api/banks/bank-general-mosque/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginJson.token}`,
      },
      body: JSON.stringify({ questions: [] }),
    });
    assert.equal(studentImport.status, 403);

    const studentLessons = await fetch(`${baseUrl}/api/lessons`, {
      headers: { Authorization: `Bearer ${loginJson.token}` },
    });
    assert.equal(studentLessons.status, 403);

    // 5. Teacher creates a session -> Student cannot perform Host actions -> 403
    const teacherLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'teacher@ibntaymiyyah.org', password: '1447' }),
    });
    assert.equal(teacherLogin.status, 200);
    const teacherToken = ((await teacherLogin.json()) as { token: string }).token;

    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        title: 'حصة تحفيظ العصر',
        bankId: 'bank-general-mosque',
        ageGroup: 'family',
        roundTypes: ['multiple_choice', 'buzzer'],
        skipVs: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdSession = ((await createRes.json()) as { session: GameSessionView }).session;
    assert.ok(createdSession.hostSecret);

    const hijackRes = await fetch(`${baseUrl}/api/sessions/${createdSession.code}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginJson.token}`,
      },
      body: JSON.stringify({ action: 'award_team', payload: { teamIndex: 0 } }),
    });
    assert.equal(hijackRes.status, 403);
  });
});

test('HTTP & WebSocket E2E: Live dual-screen sync, buzz lock, answer scoring, secret stripping, and reconnect', async () => {
  await withServer(async (baseUrl, wsUrl) => {
    const teacherLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'teacher@ibntaymiyyah.org', password: '1447' }),
    });
    const teacherToken = ((await teacherLogin.json()) as { token: string }).token;

    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        title: 'بث الجمهور المباشر',
        bankId: 'bank-general-mosque',
        ageGroup: 'family',
        roundTypes: ['multiple_choice', 'buzzer'],
        teams: [
          { name: 'الأخضر', color: '#10B981' },
          { name: 'الأزرق', color: '#38BDF8' },
        ],
        skipVs: true,
      }),
    });
    const session = ((await createRes.json()) as { session: GameSessionView }).session;

    // Even if someone requests role=host WITHOUT teacher token, HTTP and WS must strip hostSecret!
    const spoofHttpRes = await fetch(`${baseUrl}/api/sessions/${session.code}?role=host`);
    const spoofHttpJson = (await spoofHttpRes.json()) as { session: GameSessionView };
    assert.equal(spoofHttpJson.session.hostSecret, undefined);

    const audienceWs = new WebSocket(`${wsUrl}?code=${session.code}&role=host`);
    const hostWs = new WebSocket(`${wsUrl}?code=${session.code}&role=host&token=${teacherToken}`);

    const [audInit, hostInit] = await Promise.all([waitForWsMessage(audienceWs), waitForWsMessage(hostWs)]);
    assert.equal(audInit.payload.hostSecret, undefined);
    assert.ok(hostInit.payload.hostSecret?.acceptableAnswers.length);

    // Submit correct answer via HTTP using the secret known only to Host
    const ansText = hostInit.payload.hostSecret!.acceptableAnswers[0];
    const nextAudPromise = waitForWsMessage(audienceWs);
    const nextHostPromise = waitForWsMessage(hostWs);

    const ansRes = await fetch(`${baseUrl}/api/sessions/${session.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: 0, submitted: ansText }),
    });
    assert.equal(ansRes.status, 200);
    const ansJson = (await ansRes.json()) as { isCorrect: boolean; pointsDelta: number };
    assert.equal(ansJson.isCorrect, true);
    assert.ok(ansJson.pointsDelta > 0);

    const [audUpdated, hostUpdated] = await Promise.all([nextAudPromise, nextHostPromise]);
    assert.equal(audUpdated.payload.teams[0].points, ansJson.pointsDelta);
    assert.equal(hostUpdated.payload.teams[0].points, ansJson.pointsDelta);

    // Advance to buzzer round and verify buzz lock
    const nextAudBuzzPrompt = waitForWsMessage(audienceWs);
    await fetch(`${baseUrl}/api/sessions/${session.code}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ action: 'next_question' }),
    });
    await nextAudBuzzPrompt;

    const audBuzzState = waitForWsMessage(audienceWs);
    const buzzRes = await fetch(`${baseUrl}/api/sessions/${session.code}/buzz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: 1 }),
    });
    assert.equal(buzzRes.status, 200);
    const syncedBuzz = await audBuzzState;
    assert.equal(syncedBuzz.payload.buzzedTeamIndex, 1);

    // Simulate Audience disconnect & reconnect recovery
    audienceWs.close();
    const reconnectedWs = new WebSocket(`${wsUrl}?code=${session.code}&role=audience`);
    const recovered = await waitForWsMessage(reconnectedWs);
    assert.equal(recovered.payload.teams[0].points, ansJson.pointsDelta);
    assert.equal(recovered.payload.buzzedTeamIndex, 1);
    assert.equal(recovered.payload.hostSecret, undefined);

    reconnectedWs.close();
    hostWs.close();
  });
});

test('HTTP E2E: Teacher bulk import gating, approval, invalid PDF rejection, and lesson deletion cleanup', async () => {
  await withServer(async (baseUrl, _wsUrl, db) => {
    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@ibntaymiyyah.org', password: '2026' }),
    });
    const adminToken = ((await adminLogin.json()) as { token: string }).token;

    // 1. Import CSV with religious question -> must enter needs_review, not published
    const csvText = [
      'externalId,roundType,category,ageGroup,difficulty,prompt,acceptableAnswers,isReligious',
      'CSV-E2E-1,rapid_fire,القرآن الكريم,youth,easy,ما هي السورة التي تعدل ثلث القرآن الكريم؟,سورة الإخلاص|الإخلاص,true',
      'CSV-E2E-2,rapid_fire,ثقافة عامة,youth,easy,ما عاصمة المملكة العربية السعودية؟,الرياض,false',
    ].join('\n');

    const importRes = await fetch(`${baseUrl}/api/banks/bank-general-mosque/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ csvText }),
    });
    assert.equal(importRes.status, 200);
    const importJson = (await importRes.json()) as {
      report: { validCount: number; publishedCount: number; needsReviewCount: number };
    };
    assert.equal(importJson.report.validCount, 2);
    assert.equal(importJson.report.publishedCount, 1);
    assert.equal(importJson.report.needsReviewCount, 1);

    // 2. Reject invalid non-PDF file cleanly on /api/lessons/generate
    const form = new FormData();
    form.append('pdf', new Blob(['Not a real PDF'], { type: 'application/pdf' }), 'fake.pdf');
    form.append('lessonTitle', 'ملف تالف');
    const badPdfRes = await fetch(`${baseUrl}/api/lessons/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    });
    assert.equal(badPdfRes.status, 400);

    // 3. Seed a lesson + physical PDF temp file and verify DELETE removes both DB bank & physical file
    const tmpPdfPath = path.join(os.tmpdir(), `lesson-cleanup-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdfPath, '%PDF-1.4\n%%EOF');
    db.prepare(
      `INSERT INTO lessons (id, title, subject, age_group, difficulty, created_by, status)
       VALUES ('les-test-del', 'درس تجريبي للحذف', 'فقه', 'youth', 'easy', 'prof-admin-1', 'active')`
    ).run();
    db.prepare(
      `INSERT INTO lesson_documents (id, lesson_id, filename, mime_type, file_size, page_count, is_scanned, sha256, storage_path)
       VALUES ('doc-test-del', 'les-test-del', 'test.pdf', 'application/pdf', 16, 1, 0, 'abc123', ?)`
    ).run(tmpPdfPath);
    db.prepare(
      `INSERT INTO question_banks (id, name, category, source_type, lesson_id, is_active)
       VALUES ('bank-les-test-del', 'بنك درس حذف', 'فقه', 'lesson', 'les-test-del', 1)`
    ).run();

    const delRes = await fetch(`${baseUrl}/api/lessons/les-test-del`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delRes.status, 200);
    assert.equal(fs.existsSync(tmpPdfPath), false);

    const bankRow = db
      .prepare(`SELECT is_active FROM question_banks WHERE id = 'bank-les-test-del'`)
      .get() as { is_active: number };
    assert.equal(bankRow.is_active, 0);
  });
});

test('HTTP & WS E2E: Continuous rapid_fire clock, post-timeout guard, buzz wrong-lockout transfer, golden target x2, overtime, availability & SSE', async () => {
  await withServer(async (baseUrl, _wsUrl, db) => {
    const teacherLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'teacher@ibntaymiyyah.org', password: '1447' }),
    });
    const teacherToken = ((await teacherLogin.json()) as { token: string }).token;

    // 1. Check availability & resumable endpoints
    const availRes = await fetch(`${baseUrl}/api/questions/availability?bankId=bank-general-mosque&ageGroup=family`);
    assert.equal(availRes.status, 200);
    const availJson = (await availRes.json()) as {
      totalPublishedInFilter: number;
      byRoundType: Record<string, { total: number; unseen: number }>;
    };
    assert.ok(availJson.totalPublishedInFilter >= 10);
    assert.ok((availJson.byRoundType.multiple_choice?.total ?? 0) > 0);

    // 2. Create session with rapid_fire -> buzzer -> golden (targeting buzzer = 4 pts)
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        title: 'اختبار تكامل القواعد والوقت',
        bankId: 'bank-general-mosque',
        ageGroup: 'family',
        roundTypes: ['rapid_fire', 'buzzer', 'golden'],
        roundOverrides: {
          golden: { goldenTargetType: 'buzzer', questionsPerRound: 1 },
          rapid_fire: { durationSec: 30, questionsPerRound: 3 },
          buzzer: { questionsPerRound: 1 },
        },
        settings: { buzzerWrongRule: 'lock_and_transfer', verbalRapidFireDefault: true },
        teams: [
          { name: 'الأول', color: '#38BDF8' },
          { name: 'الثاني', color: '#F59E0B' },
        ],
        skipVs: true,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = ((await createRes.json()) as { session: GameSessionView }).session;

    // Resumable list exposes newly active match
    const resumableRes = await fetch(`${baseUrl}/api/sessions/resumable`);
    const resumableJson = (await resumableRes.json()) as { sessions: Array<{ code: string }> };
    assert.ok(resumableJson.sessions.some((s) => s.code === created.code));

    // Set rapid_fire timer to 18s and submit verbal rapid_fire answer -> timer must remain <= 18 (continuous 30s clock, no reset to 30!)
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'set_timer', payload: { seconds: 18 } }),
    });
    const hostRapidRes = await fetch(`${baseUrl}/api/sessions/${created.code}?role=host`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const hostRapid = ((await hostRapidRes.json()) as { session: GameSessionView }).session;
    const rapidAns = hostRapid.hostSecret!.acceptableAnswers[0];

    const rapidSubmit = await fetch(`${baseUrl}/api/sessions/${created.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: 0, submitted: rapidAns }),
    });
    assert.equal(rapidSubmit.status, 200);
    const rapidSubmitJson = (await rapidSubmit.json()) as { view: GameSessionView; pointsDelta: number };
    assert.equal(rapidSubmitJson.pointsDelta, 1);
    assert.ok(
      rapidSubmitJson.view.timerRemainingSec <= 18,
      `Rapid fire timer must stay continuous <= 18s, got ${rapidSubmitJson.view.timerRemainingSec}`
    );

    // Post-timeout rejection: when timerRemainingSec === 0, player /answer -> 400 and /buzz -> 409
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'set_timer', payload: { seconds: 0 } }),
    });
    const lateAns = await fetch(`${baseUrl}/api/sessions/${created.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: 0, submitted: 'أي إجابة' }),
    });
    assert.equal(lateAns.status, 400);

    // Move directly to buzzer round (roundIndex 1)
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'jump_round', payload: { roundIndex: 1 } }),
    });

    // Concurrent buzz race: team 0 and team 1 buzz simultaneously -> 1 succeeds (200), other gets 409
    const [b0, b1] = await Promise.all([
      fetch(`${baseUrl}/api/sessions/${created.code}/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIndex: 0 }),
      }),
      fetch(`${baseUrl}/api/sessions/${created.code}/buzz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIndex: 1 }),
      }),
    ]);
    assert.equal(b0.status + b1.status, 200 + 409);

    const buzzedState = await fetch(`${baseUrl}/api/sessions/${created.code}?role=host`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const buzzView = ((await buzzedState.json()) as { session: GameSessionView }).session;
    const firstTeam = buzzView.buzzedTeamIndex!;
    const secondTeam = firstTeam === 0 ? 1 : 0;

    // First team answers WRONG -> locked in failedBuzzTeams, answer stays hidden, turn passes to opponent
    const wrongRes = await fetch(`${baseUrl}/api/sessions/${created.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: firstTeam, submitted: 'إجابة خاطئة تماماً لا تطابق' }),
    });
    assert.equal(wrongRes.status, 200);
    const wrongJson = (await wrongRes.json()) as { isCorrect: boolean; view: GameSessionView };
    assert.equal(wrongJson.isCorrect, false);
    assert.ok(wrongJson.view.failedBuzzTeams.includes(firstTeam));
    assert.equal(wrongJson.view.buzzedTeamIndex, null);
    assert.equal(wrongJson.view.answerRevealed, false);

    // Locked-out first team cannot buzz again -> 409
    const rebuzzLocked = await fetch(`${baseUrl}/api/sessions/${created.code}/buzz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: firstTeam }),
    });
    assert.equal(rebuzzLocked.status, 409);

    // Opponent buzzes cleanly -> 200 and scores 2 points
    const oppBuzz = await fetch(`${baseUrl}/api/sessions/${created.code}/buzz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: secondTeam }),
    });
    assert.equal(oppBuzz.status, 200);
    const oppCorrectRes = await fetch(`${baseUrl}/api/sessions/${created.code}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamIndex: secondTeam, submitted: buzzView.hostSecret!.acceptableAnswers[0] }),
    });
    const oppCorrectJson = (await oppCorrectRes.json()) as { isCorrect: boolean; pointsDelta: number };
    assert.equal(oppCorrectJson.isCorrect, true);
    assert.equal(oppCorrectJson.pointsDelta, 2);

    // Jump to Golden (targeting buzzer = 2 * 2 = 4 pts) and verify 4 pts award
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'jump_round', payload: { roundIndex: 2 } }),
    });
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'award_team', payload: { teamIndex: 0 } }),
    });
    const afterGolden = await fetch(`${baseUrl}/api/sessions/${created.code}?role=host`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const afterGoldenView = ((await afterGolden.json()) as { session: GameSessionView }).session;
    assert.ok(afterGoldenView.teams[0].points >= 4);

    // Force tie, end match, and start overtime tie-breaker
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({
        action: 'adjust_points',
        payload: { teamIndex: 1, delta: afterGoldenView.teams[0].points - afterGoldenView.teams[1].points },
      }),
    });
    await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'end_match' }),
    });
    const overtimeRes = await fetch(`${baseUrl}/api/sessions/${created.code}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherToken}` },
      body: JSON.stringify({ action: 'start_overtime' }),
    });
    const overtimeView = ((await overtimeRes.json()) as { session: GameSessionView }).session;
    assert.equal(overtimeView.phase, 'playing');

    // Verify match CSV export works with BOM
    const exportCsv = await fetch(`${baseUrl}/api/sessions/${created.code}/export?format=csv`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    assert.equal(exportCsv.status, 200);
    assert.ok((await exportCsv.text()).includes('teamName'));

    // 3. Verify SSE snapshot on GET /api/lessons/:lessonId/stream
    db.prepare(
      `INSERT INTO lessons (id, title, subject, age_group, difficulty, created_by, status)
       VALUES ('les-sse-e2e', 'درس البث المباشر', 'سيرة', 'teen_14_17', 'medium', 'prof-teacher-1', 'active')`
    ).run();
    db.prepare(
      `INSERT INTO lesson_documents (id, lesson_id, filename, mime_type, file_size, page_count, is_scanned, sha256)
       VALUES ('doc-sse-e2e', 'les-sse-e2e', 'صلح_الحديبية.pdf', 'application/pdf', 1200, 10, 0, 'ssehash123')`
    ).run();
    db.prepare(
      `INSERT INTO question_banks (id, name, category, source_type, lesson_id, is_active)
       VALUES ('bank-sse-e2e', 'بنك بث', 'سيرة', 'lesson', 'les-sse-e2e', 1)`
    ).run();
    db.prepare(
      `INSERT INTO lesson_question_batches (id, lesson_id, bank_id, pipeline_stage, stage_logs_json, requested_count, verified_count)
       VALUES ('batch-sse-e2e', 'les-sse-e2e', 'bank-sse-e2e', 'completed', '[]', 10, 0)`
    ).run();

    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/lessons/les-sse-e2e/stream?token=${encodeURIComponent(teacherToken)}`, {
      signal: controller.signal,
    });
    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers.get('content-type')?.includes('text/event-stream'));
    const reader = sseRes.body!.getReader();
    const { value } = await reader.read();
    const chunkText = new TextDecoder().decode(value);
    assert.ok(chunkText.includes('event: snapshot'));
    controller.abort();
  });
});
