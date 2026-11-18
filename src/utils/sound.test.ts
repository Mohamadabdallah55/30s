import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_ROUND_TYPES } from '../shared/gameRules';
import {
  SOUND_CATEGORY_PRESETS,
  buildApplauseSteps,
  buildHostCueSteps,
  buildVictoryFanfare,
  getRoundSoundCategory,
  getRoundSoundCategoryLabelAr,
} from './soundProfiles';

test('Every one of the 12 RoundTypes maps to an explicit audio category and complete preset', () => {
  assert.equal(getRoundSoundCategory('rapid_fire'), 'rapid_sprint');
  assert.equal(getRoundSoundCategory('true_false'), 'rapid_sprint');
  assert.equal(getRoundSoundCategory('buzzer'), 'show_duel');
  assert.equal(getRoundSoundCategory('bid_challenge'), 'show_duel');
  assert.equal(getRoundSoundCategory('who_am_i'), 'mystery_focus');
  assert.equal(getRoundSoundCategory('memory'), 'mystery_focus');
  assert.equal(getRoundSoundCategory('order_items'), 'mystery_focus');
  assert.equal(getRoundSoundCategory('odd_one_out'), 'mystery_focus');
  assert.equal(getRoundSoundCategory('multiple_choice'), 'precision_quiz');
  assert.equal(getRoundSoundCategory('fill_blank'), 'precision_quiz');
  assert.equal(getRoundSoundCategory('list_multiple'), 'precision_quiz');
  assert.equal(getRoundSoundCategory('golden', 'rapid_fire'), 'golden_finale');

  for (const rt of ALL_ROUND_TYPES) {
    const category = getRoundSoundCategory(rt);
    const preset = SOUND_CATEGORY_PRESETS[category];
    assert.ok(preset, `Missing sound preset for ${rt}`);
    assert.ok(preset.introTones.length >= 3, `Preset ${category} needs intro tones`);
    assert.ok(preset.correctTones.length >= 2, `Preset ${category} needs correct tones`);
    assert.ok(preset.wrongTones.length >= 2, `Preset ${category} needs wrong tones`);
    assert.ok(preset.urgentTickFreq > 400);
    assert.ok(getRoundSoundCategoryLabelAr(category).length > 5);
  }
});

test('Rapid sprint rounds include energetic percussion hits distinct from calm mystery focus', () => {
  const rapid = SOUND_CATEGORY_PRESETS.rapid_sprint;
  const mystery = SOUND_CATEGORY_PRESETS.mystery_focus;

  assert.equal(rapid.energyLevel, 'high');
  assert.ok(rapid.introPercussion.length >= 2, 'Rapid sprint intro should have energetic rhythmic percussion');
  assert.equal(rapid.urgentTickDoublePulse, true);

  assert.equal(mystery.energyLevel, 'calm');
  assert.equal(mystery.introPercussion.length, 0);
  assert.equal(mystery.urgentTickDoublePulse, false);
});

test('buildApplauseSteps and buildVictoryFanfare generate layered celebratory applause and fanfare cues', () => {
  const fullApplause = buildApplauseSteps(1.6, 'full');
  const lightApplause = buildApplauseSteps(0.8, 'light');

  assert.ok(fullApplause.length > 12);
  assert.ok(lightApplause.length >= 5 && lightApplause.length < fullApplause.length);
  assert.ok(fullApplause.every((s) => s.durationSec > 0 && s.filterFreq > 0 && s.delay >= 0));
  assert.ok(getRoundSoundCategoryLabelAr('victory_applause').includes('تصفيق'));

  const winNotes = buildVictoryFanfare(false);
  const tieNotes = buildVictoryFanfare(true);
  assert.ok(winNotes.length >= 4);
  assert.ok(tieNotes.length >= 3);
  assert.ok(winNotes.some((n) => n.freq >= 1000), 'Win fanfare should peak higher than tie chords');
});

test('buildHostCueSteps produces lightweight mood-matched host chimes and stays silent on idle', () => {
  assert.equal(buildHostCueSteps('idle').tones.length, 0);
  for (const mood of ['hyped', 'thinking', 'tense', 'celebrating', 'shocked', 'teasing'] as const) {
    const cue = buildHostCueSteps(mood);
    assert.ok(cue.tones.length >= 2, `Missing host chime tones for ${mood}`);
    assert.ok(cue.tones.every((t) => t.gainPeak > 0 && t.gainPeak <= 0.055), `Host chime for ${mood} should stay gentle`);
  }
});
