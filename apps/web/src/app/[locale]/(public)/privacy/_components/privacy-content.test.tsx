import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { PrivacyContent } from './privacy-content';

const OPERATOR = 'operator@example.com';

function section(heading: string): HTMLElement {
  const element = screen.getByRole('heading', { level: 2, name: heading }).closest('section');
  if (element === null) {
    throw new Error(`No section for heading ${heading}`);
  }
  return element;
}

describe('PrivacyContent', () => {
  it('names_each_recipient_of_queries_coordinates_and_ip_addresses', () => {
    renderWithIntl(<PrivacyContent contactEmail={OPERATOR} />);

    const recipients = section('Who else receives data');
    expect(within(recipients).getByText(/komoot/)).toHaveTextContent('text you search for');
    expect(within(recipients).getByText(/OpenStreetMap Foundation/)).toBeInTheDocument();
    expect(within(recipients).getByText(/FOSSGIS e\.V\./)).toHaveTextContent('coordinates');
    expect(
      within(recipients).getByRole('link', { name: 'OpenFreeMap' }).closest('li'),
    ).toHaveTextContent('IP address');
  });

  it('says_notes_stay_private', () => {
    renderWithIntl(<PrivacyContent contactEmail={OPERATOR} />);

    expect(
      within(section('What we store')).getByText(/notes on places are private/),
    ).toBeInTheDocument();
  });

  it('links_account_deletion_to_the_settings_account_section', () => {
    renderWithIntl(<PrivacyContent contactEmail={OPERATOR} />);

    expect(
      within(section('Deleting your data')).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('href', '/en/settings#account');
  });

  it('links_the_operator_address_when_configured', () => {
    renderWithIntl(<PrivacyContent contactEmail={OPERATOR} />);

    expect(within(section('Contact')).getByRole('link', { name: OPERATOR })).toHaveAttribute(
      'href',
      `mailto:${OPERATOR}`,
    );
  });

  it('says_no_contact_is_configured_when_the_address_is_unset', () => {
    renderWithIntl(<PrivacyContent contactEmail={null} />);

    expect(within(section('Contact')).queryByRole('link')).not.toBeInTheDocument();
    expect(section('Contact')).toHaveTextContent('has not configured a contact address');
  });

  it('renders_in_portuguese', () => {
    renderWithIntl(<PrivacyContent contactEmail={null} />, { locale: 'pt-BR' });

    expect(screen.getByRole('heading', { level: 1, name: 'Privacidade' })).toBeInTheDocument();
    expect(section('Quem mais recebe dados')).toHaveTextContent('komoot');
  });
});
