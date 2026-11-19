import { describe, expect, it } from 'vitest';
import { cacheKeys, roundCoordinate } from './cache-keys.js';

const FROM = { lng: -9.136612, lat: 38.707543 };
const TO = { lng: -9.1421, lat: 38.71081 };

describe('cacheKeys', () => {
  it('builds_leg_keys_with_provider_mode_and_5_decimal_points', () => {
    expect(cacheKeys.leg('osrm-fossgis', 'walk', FROM, TO)).toBe(
      'leg:v1:osrm-fossgis:walk:-9.13661,38.70754>-9.14210,38.71081',
    );
  });

  it('keeps_fake_and_real_entries_apart', () => {
    expect(cacheKeys.leg('fake', 'walk', FROM, TO)).not.toBe(
      cacheKeys.leg('osrm-fossgis', 'walk', FROM, TO),
    );
    expect(cacheKeys.geo('fake', 'q=lisboa')).not.toBe(cacheKeys.geo('photon', 'q=lisboa'));
  });

  it('keeps_directions_and_modes_apart', () => {
    expect(cacheKeys.leg('fake', 'walk', FROM, TO)).not.toBe(
      cacheKeys.leg('fake', 'walk', TO, FROM),
    );
    expect(cacheKeys.leg('fake', 'walk', FROM, TO)).not.toBe(
      cacheKeys.leg('fake', 'bike', FROM, TO),
    );
  });

  it('prefixes_geo_and_place_keys', () => {
    expect(cacheKeys.geo('photon', 'https://photon.example/api/?q=x')).toBe(
      'geo:v1:photon:https://photon.example/api/?q=x',
    );
    expect(cacheKeys.place('osm:W:1370081491')).toBe('place:v1:osm:W:1370081491');
  });
});

describe('roundCoordinate', () => {
  it('writes_negative_zero_as_zero', () => {
    expect(roundCoordinate(-0.000001, 5)).toBe('0.00000');
    expect(roundCoordinate(-0, 4)).toBe('0.0000');
  });

  it('keeps_the_sign_of_other_negatives', () => {
    expect(roundCoordinate(-9.000004, 5)).toBe('-9.00000');
  });
});
