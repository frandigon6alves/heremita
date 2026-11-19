import type { UserProfile } from '@heremita/shared';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { ProfileHeader } from './profile-header';

const profile: UserProfile = {
  id: '0195f0c8-0000-7000-8000-00000000c001',
  displayName: 'Ana',
  isDemo: true,
  joinedMonth: '2026-10',
  publicTripCount: 3,
  reviewCount: 0,
};

describe('ProfileHeader', () => {
  it('shows_name_demo_badge_member_month_and_counts', () => {
    renderWithProviders(<ProfileHeader profile={profile} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana Example');
    expect(screen.getByText('Member since Oct 2026')).toBeVisible();
    expect(screen.getByText('3 public trips · No reviews')).toBeVisible();
  });

  it('speaks_portuguese_without_the_badge_for_real_users', () => {
    renderWithProviders(
      <ProfileHeader profile={{ ...profile, isDemo: false, publicTripCount: 1, reviewCount: 1 }} />,
      { locale: 'pt-BR' },
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Ana$/);
    expect(screen.getByText(/^Membro desde out\.? de 2026$/)).toBeVisible();
    expect(screen.getByText('1 viagem pública · 1 avaliação')).toBeVisible();
  });
});
