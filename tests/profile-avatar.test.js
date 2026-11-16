import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mustProfileImageUrl, profileInitials } from '../js/profile-avatar.js';

describe('mustProfileImageUrl', () => {
  it('points at Must image API by uri', () => {
    assert.equal(
      mustProfileImageUrl('grotesque'),
      'https://mustapp.com/api/users/uri/grotesque/image',
    );
    assert.equal(mustProfileImageUrl(''), null);
  });
});

describe('profileInitials', () => {
  it('uses name words or uri prefix', () => {
    assert.equal(profileInitials('Азамат', 'grotesque'), 'А');
    assert.equal(profileInitials('', 'grotesque'), 'GR');
  });
});