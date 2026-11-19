import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { AboutContent } from './about-content';

const OPERATOR = 'operator@example.com';

describe('AboutContent', () => {
  it('credits_openstreetmap_under_the_odbl_with_a_fix_the_map_link', () => {
    renderWithIntl(<AboutContent contactEmail={OPERATOR} />);

    const credit = screen.getByRole('link', { name: 'OpenStreetMap contributors' });
    expect(credit).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    expect(credit.closest('li')).toHaveTextContent('Open Database License (ODbL)');
    expect(screen.getByRole('link', { name: 'Fix the map' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/fixthemap',
    );
  });

  it('credits_every_map_search_and_routing_service', () => {
    renderWithIntl(<AboutContent contactEmail={OPERATOR} />);

    for (const name of ['OpenFreeMap', 'VersaTiles', 'OSRM', 'Photon', 'Nominatim', 'Lucide']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'OSRM' }).closest('li')).toHaveTextContent(
      'FOSSGIS e.V.',
    );
  });

  it('links_the_operator_address_when_configured', () => {
    renderWithIntl(<AboutContent contactEmail={OPERATOR} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: OPERATOR })).toHaveAttribute(
      'href',
      `mailto:${OPERATOR}`,
    );
  });

  it('says_no_contact_is_configured_when_the_address_is_unset', () => {
    renderWithIntl(<AboutContent contactEmail={null} />);

    expect(
      screen.getByText('This installation has not configured a contact address yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
  });

  it('renders_in_portuguese', () => {
    renderWithIntl(<AboutContent contactEmail={OPERATOR} />, { locale: 'pt-BR' });

    expect(screen.getByRole('heading', { level: 1, name: 'Sobre o Heremita' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Corrija o mapa' })).toBeInTheDocument();
  });
});
