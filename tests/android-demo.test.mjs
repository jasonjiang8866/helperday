import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoEnvironment, checkGeneratedProject } from '../scripts/build-android-demo.mjs';

test('Demo build strips backend values, privileged keys, Expo tokens and unknown public variables', () => {
  const env = demoEnvironment({ PATH: '/bin', JAVA_HOME: '/jdk',
    EXPO_TOKEN: 'private-token', EAS_BUILD_PROFILE: 'preview',
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'service-role-should-never-survive',
    EXPO_PUBLIC_OTHER_SECRET: 'secret', SUPABASE_SERVICE_ROLE_KEY: 'private',
  });
  assert.equal(env.PATH, '/bin');
  assert.equal(env.JAVA_HOME, '/jdk');
  assert.equal(env.EXPO_NO_DOTENV, '1');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL, '');
  assert.equal(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, '');
  for (const key of ['EXPO_TOKEN', 'EAS_BUILD_PROFILE', 'EXPO_PUBLIC_OTHER_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'])
    assert.equal(key in env, false);
});

test('native template guard fails closed if package, embedded bundling or test signing changes', () => {
  const gradle = `applicationId 'com.helperday.app'\nrelease { signingConfig signingConfigs.debug }\nbundleCommand = "export:embed"`;
  assert.doesNotThrow(() => checkGeneratedProject(gradle));
  for (const broken of [gradle.replace('com.helperday.app', 'com.other'),
    gradle.replace('signingConfigs.debug', 'signingConfigs.production'),
    gradle.replace('export:embed', 'bundle')])
    assert.throws(() => checkGeneratedProject(broken), /template changed/);
});
