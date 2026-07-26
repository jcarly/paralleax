-- Girl Life compatibility prototype for Paralleax
--
-- Source studied: https://gitlab.com/kevinsmartstfg/girl-life
-- Source revision: a800ea3c9cb992d6fa148ae7b5d2938f7cf772fc
--
-- This is an original, non-explicit, adult-only adaptation of broad gameplay
-- concepts. It does not copy Girl Life prose, media, or explicit scenes.
-- The source repository did not expose a project-wide content license when this
-- adaptation was prepared.
--
-- DEVELOPMENT PROTOTYPE ONLY:
-- Do not run this import against production data. The current Paralleax
-- migration history contains destructive development migrations, and schema
-- migration is still application-managed. A supported import command,
-- pre-import backup, schema-version check, and restoration test are required
-- before using large SQL imports operationally.
--
-- Import:
--   1. Run all Paralleax migrations.
--   2. Ensure at least one Paralleax user exists.
--   3. Optionally select the owner in the same psql session:
--        SET paralleax.import_user_id = 'your-user-id';
--   4. Execute this file with psql.
--
-- The import is idempotent: rerunning it replaces only this story.

BEGIN;

DO $$
DECLARE
  owner_id text;
  story_id constant text := 'import-girl-life-safe-prototype';
BEGIN
  owner_id := nullif(current_setting('paralleax.import_user_id', true), '');

  IF owner_id IS NULL THEN
    SELECT id INTO owner_id
    FROM users
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF owner_id IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = owner_id) THEN
    RAISE EXCEPTION
      'A valid Paralleax user is required. Set paralleax.import_user_id before importing.';
  END IF;

  DELETE FROM stories WHERE id = story_id;

  INSERT INTO stories (id, revision, title, created_at, updated_at, creator_user_id)
  VALUES (
    story_id,
    1,
    'A New Life — compatibility prototype',
    now(),
    now(),
    owner_id
  );

  INSERT INTO locations (id, story_id, name, description, sort_order) VALUES
    ('gl-location-flat', story_id, 'Shared flat', 'A modest base in the city.', 0),
    ('gl-location-city', story_id, 'City centre', 'Work, services, and new opportunities.', 1),
    ('gl-location-campus', story_id, 'Adult education campus', 'Evening courses for adult students.', 2),
    ('gl-location-village', story_id, 'Country village', 'A quiet village where relatives need help.', 3),
    ('gl-location-cafe', story_id, 'Neighbourhood café', 'A friendly place to work and meet people.', 4);

  INSERT INTO characters (id, story_id, name, description, sort_order) VALUES
    ('gl-character-player', story_id, 'Alex', 'A 20-year-old beginning an independent adult life.', 0),
    ('gl-character-sister', story_id, 'Maya', 'Alex''s older sister and first contact in the city.', 1),
    ('gl-character-friend', story_id, 'Nika', 'A childhood friend rebuilding an old friendship.', 2),
    ('gl-character-teacher', story_id, 'Dr. Sokolov', 'An evening-course tutor.', 3),
    ('gl-character-manager', story_id, 'Elena', 'The manager of the neighbourhood café.', 4),
    ('gl-character-grandparent', story_id, 'Val', 'A relative living in the country village.', 5);

  INSERT INTO stat_definitions (id, story_id, name, sort_order) VALUES
    ('gl-stat-energy-definition', story_id, 'Energy', 0),
    ('gl-stat-money-definition', story_id, 'Money', 1),
    ('gl-stat-confidence-definition', story_id, 'Confidence', 2),
    ('gl-stat-study-definition', story_id, 'Study progress', 3),
    ('gl-stat-family-definition', story_id, 'Family trust', 4);

  INSERT INTO character_stats
    (id, story_id, character_id, stat_definition_id, initial_value, sort_order)
  VALUES
    ('gl-stat-energy', story_id, 'gl-character-player', 'gl-stat-energy-definition', 6, 0),
    ('gl-stat-money', story_id, 'gl-character-player', 'gl-stat-money-definition', 2, 1),
    ('gl-stat-confidence', story_id, 'gl-character-player', 'gl-stat-confidence-definition', 1, 2),
    ('gl-stat-study', story_id, 'gl-character-player', 'gl-stat-study-definition', 0, 3),
    ('gl-stat-family', story_id, 'gl-character-player', 'gl-stat-family-definition', 1, 4);

  INSERT INTO item_definitions (id, story_id, name, description, sort_order) VALUES
    ('gl-item-phone-definition', story_id, 'Phone', 'Used to stay in touch and organize plans.', 0),
    ('gl-item-notebook-definition', story_id, 'Notebook', 'Course notes and personal goals.', 1),
    ('gl-item-key-definition', story_id, 'Flat key', 'A key to the shared flat.', 2),
    ('gl-item-bus-pass-definition', story_id, 'Bus pass', 'Travel between the city and village.', 3);

  INSERT INTO character_items
    (id, story_id, character_id, item_definition_id, sort_order)
  VALUES
    ('gl-item-phone', story_id, 'gl-character-player', 'gl-item-phone-definition', 0),
    ('gl-item-flat-key', story_id, 'gl-character-player', 'gl-item-key-definition', 1);

  INSERT INTO interactions
    (id, story_id, title, body, position_x, position_y, sort_order, location_id)
  VALUES
    (
      'gl-intro',
      story_id,
      'Choose a direction',
      'At twenty, Alex has arrived in a new region with a place to stay and several possible paths. Work, study, and family are all competing for attention.',
      80, 120, 0, 'gl-location-flat'
    ),
    (
      'gl-city-start',
      story_id,
      'Look for work',
      'Alex heads into the city centre to look for a reliable source of income.',
      -360, 300, 1, 'gl-location-city'
    ),
    (
      'gl-study-start',
      story_id,
      'Explore adult education',
      'The local campus offers evening classes that can open better opportunities.',
      80, 300, 2, 'gl-location-campus'
    ),
    (
      'gl-village-start',
      story_id,
      'Visit family in the village',
      'A message from Val offers a quieter start and useful work in the countryside.',
      520, 300, 3, 'gl-location-village'
    ),
    (
      'gl-cafe-application',
      story_id,
      'Apply at the café',
      'Elena needs dependable help. The work is tiring, but the regular pay would make city life easier.',
      -500, 480, 4, 'gl-location-cafe'
    ),
    (
      'gl-city-network',
      story_id,
      'Reconnect with Nika',
      'Nika knows the neighbourhood and offers advice about work, transport, and local events.',
      -220, 480, 5, 'gl-location-city'
    ),
    (
      'gl-first-shift',
      story_id,
      'Complete the first shift',
      'Alex learns the café routine and earns the first proper wage.',
      -500, 660, 6, 'gl-location-cafe'
    ),
    (
      'gl-enrol',
      story_id,
      'Enrol in an evening class',
      'Dr. Sokolov explains the course and asks for consistent attendance.',
      20, 480, 7, 'gl-location-campus'
    ),
    (
      'gl-buy-notebook',
      story_id,
      'Prepare for class',
      'Alex buys a notebook and organizes a realistic weekly schedule.',
      200, 480, 8, 'gl-location-city'
    ),
    (
      'gl-first-class',
      story_id,
      'Attend the first class',
      'The first lesson is demanding, but completing it makes the longer goal feel possible.',
      80, 660, 9, 'gl-location-campus'
    ),
    (
      'gl-help-family',
      story_id,
      'Help around the village',
      'Val has a list of repairs and errands. Finishing them would rebuild family trust.',
      440, 480, 10, 'gl-location-village'
    ),
    (
      'gl-village-community',
      story_id,
      'Meet the village community',
      'A day spent helping neighbours creates useful connections and a sense of belonging.',
      650, 480, 11, 'gl-location-village'
    ),
    (
      'gl-return-city',
      story_id,
      'Return to the city',
      'With a bus pass and renewed family support, Alex can combine village visits with city plans.',
      520, 660, 12, 'gl-location-city'
    ),
    (
      'gl-balanced-week',
      story_id,
      'Build a balanced week',
      'Work, study, friendships, and family can coexist, but only with enough energy and planning.',
      80, 840, 13, 'gl-location-flat'
    ),
    (
      'gl-low-energy-ending',
      story_id,
      'Take time to recover',
      'Alex chooses to rest and reconsider the schedule before taking on more commitments.',
      -250, 840, 14, 'gl-location-flat'
    );

  INSERT INTO interaction_characters
    (story_id, interaction_id, character_id, sort_order)
  VALUES
    (story_id, 'gl-intro', 'gl-character-player', 0),
    (story_id, 'gl-intro', 'gl-character-sister', 1),
    (story_id, 'gl-city-start', 'gl-character-player', 0),
    (story_id, 'gl-cafe-application', 'gl-character-player', 0),
    (story_id, 'gl-cafe-application', 'gl-character-manager', 1),
    (story_id, 'gl-city-network', 'gl-character-player', 0),
    (story_id, 'gl-city-network', 'gl-character-friend', 1),
    (story_id, 'gl-first-shift', 'gl-character-player', 0),
    (story_id, 'gl-first-shift', 'gl-character-manager', 1),
    (story_id, 'gl-enrol', 'gl-character-player', 0),
    (story_id, 'gl-enrol', 'gl-character-teacher', 1),
    (story_id, 'gl-first-class', 'gl-character-player', 0),
    (story_id, 'gl-first-class', 'gl-character-teacher', 1),
    (story_id, 'gl-help-family', 'gl-character-player', 0),
    (story_id, 'gl-help-family', 'gl-character-grandparent', 1),
    (story_id, 'gl-village-community', 'gl-character-player', 0),
    (story_id, 'gl-village-community', 'gl-character-grandparent', 1),
    (story_id, 'gl-return-city', 'gl-character-player', 0),
    (story_id, 'gl-balanced-week', 'gl-character-player', 0),
    (story_id, 'gl-low-energy-ending', 'gl-character-player', 0);

  INSERT INTO interaction_stat_effects
    (story_id, interaction_id, stat_id, operation, value, sort_order)
  VALUES
    (story_id, 'gl-city-start', 'gl-stat-energy', 'add', -1, 0),
    (story_id, 'gl-cafe-application', 'gl-stat-confidence', 'add', 1, 0),
    (story_id, 'gl-first-shift', 'gl-stat-money', 'add', 3, 0),
    (story_id, 'gl-first-shift', 'gl-stat-energy', 'add', -2, 1),
    (story_id, 'gl-city-network', 'gl-stat-confidence', 'add', 1, 0),
    (story_id, 'gl-enrol', 'gl-stat-study', 'add', 1, 0),
    (story_id, 'gl-buy-notebook', 'gl-stat-money', 'add', -1, 0),
    (story_id, 'gl-first-class', 'gl-stat-study', 'add', 2, 0),
    (story_id, 'gl-first-class', 'gl-stat-energy', 'add', -2, 1),
    (story_id, 'gl-help-family', 'gl-stat-family', 'add', 2, 0),
    (story_id, 'gl-help-family', 'gl-stat-energy', 'add', -1, 1),
    (story_id, 'gl-village-community', 'gl-stat-confidence', 'add', 1, 0);

  INSERT INTO triggers (id, story_id, output_interaction_id, conditions, sort_order) VALUES
    ('gl-trigger-intro', story_id, 'gl-intro', '[]'::jsonb, 0),
    ('gl-trigger-city-start', story_id, 'gl-city-start', '[]'::jsonb, 0),
    ('gl-trigger-study-start', story_id, 'gl-study-start', '[]'::jsonb, 0),
    ('gl-trigger-village-start', story_id, 'gl-village-start', '[]'::jsonb, 0),
    ('gl-trigger-cafe', story_id, 'gl-cafe-application', '[]'::jsonb, 0),
    ('gl-trigger-network', story_id, 'gl-city-network', '[]'::jsonb, 0),
    ('gl-trigger-shift', story_id, 'gl-first-shift',
      '[{"statId":"gl-stat-energy","operator":"gte","value":2}]'::jsonb, 0),
    ('gl-trigger-enrol', story_id, 'gl-enrol', '[]'::jsonb, 0),
    ('gl-trigger-notebook', story_id, 'gl-buy-notebook',
      '[{"statId":"gl-stat-money","operator":"gte","value":1}]'::jsonb, 0),
    ('gl-trigger-class-from-enrol', story_id, 'gl-first-class', '[]'::jsonb, 0),
    ('gl-trigger-class-from-notebook', story_id, 'gl-first-class', '[]'::jsonb, 1),
    ('gl-trigger-help-family', story_id, 'gl-help-family', '[]'::jsonb, 0),
    ('gl-trigger-community', story_id, 'gl-village-community', '[]'::jsonb, 0),
    ('gl-trigger-return', story_id, 'gl-return-city',
      '[{"statId":"gl-stat-family","operator":"gte","value":3}]'::jsonb, 0),
    ('gl-trigger-balanced-work', story_id, 'gl-balanced-week',
      '[{"statId":"gl-stat-money","operator":"gte","value":3},{"statId":"gl-stat-study","operator":"gte","value":2}]'::jsonb, 0),
    ('gl-trigger-balanced-family', story_id, 'gl-balanced-week',
      '[{"statId":"gl-stat-family","operator":"gte","value":3},{"statId":"gl-stat-confidence","operator":"gte","value":2}]'::jsonb, 1),
    ('gl-trigger-recover-work', story_id, 'gl-low-energy-ending',
      '[{"statId":"gl-stat-energy","operator":"lt","value":2}]'::jsonb, 0),
    ('gl-trigger-recover-study', story_id, 'gl-low-energy-ending',
      '[{"statId":"gl-stat-energy","operator":"lt","value":2}]'::jsonb, 1);

  INSERT INTO trigger_inputs
    (story_id, trigger_id, input_interaction_id, sort_order)
  VALUES
    (story_id, 'gl-trigger-city-start', 'gl-intro', 0),
    (story_id, 'gl-trigger-study-start', 'gl-intro', 0),
    (story_id, 'gl-trigger-village-start', 'gl-intro', 0),
    (story_id, 'gl-trigger-cafe', 'gl-city-start', 0),
    (story_id, 'gl-trigger-network', 'gl-city-start', 0),
    (story_id, 'gl-trigger-shift', 'gl-cafe-application', 0),
    (story_id, 'gl-trigger-enrol', 'gl-study-start', 0),
    (story_id, 'gl-trigger-notebook', 'gl-study-start', 0),
    (story_id, 'gl-trigger-class-from-enrol', 'gl-enrol', 0),
    (story_id, 'gl-trigger-class-from-notebook', 'gl-buy-notebook', 0),
    (story_id, 'gl-trigger-help-family', 'gl-village-start', 0),
    (story_id, 'gl-trigger-community', 'gl-village-start', 0),
    (story_id, 'gl-trigger-return', 'gl-help-family', 0),
    (story_id, 'gl-trigger-balanced-work', 'gl-first-shift', 0),
    (story_id, 'gl-trigger-balanced-work', 'gl-first-class', 1),
    (story_id, 'gl-trigger-balanced-family', 'gl-return-city', 0),
    (story_id, 'gl-trigger-balanced-family', 'gl-city-network', 1),
    (story_id, 'gl-trigger-recover-work', 'gl-first-shift', 0),
    (story_id, 'gl-trigger-recover-study', 'gl-first-class', 0);
END
$$;

COMMIT;
