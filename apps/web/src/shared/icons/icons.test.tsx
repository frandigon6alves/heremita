import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as icons from './icons';

const all = Object.entries(icons);

describe('icons', () => {
  it('exports_the_whole_set', () => {
    expect(all.map(([name]) => name).sort()).toEqual(
      [
        'ArrowRight',
        'Bike',
        'CalendarDays',
        'Car',
        'Check',
        'ChevronDown',
        'ChevronLeft',
        'CircleUser',
        'Compass',
        'Copy',
        'Ellipsis',
        'Flag',
        'Footprints',
        'Globe',
        'GripVertical',
        'Info',
        'Languages',
        'Link',
        'ListOrdered',
        'Lock',
        'LogOut',
        'Map',
        'MapPin',
        'MapPinPlus',
        'Monitor',
        'Moon',
        'Navigation',
        'Plus',
        'Route',
        'Search',
        'Settings',
        'Share2',
        'Shell',
        'ShieldCheck',
        'Sparkles',
        'Star',
        'Sun',
        'Trash',
        'Users',
        'X',
      ].sort(),
    );
  });

  it.each(all)('%s is hidden from assistive technology and drawn in currentColor', (_, Icon) => {
    const { container } = render(<Icon size={20} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg?.children.length).toBeGreaterThan(0);
  });
});
