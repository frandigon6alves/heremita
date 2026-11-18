import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as icons from './icons';

const all = Object.entries(icons);

describe('icons', () => {
  it('exports_the_whole_set', () => {
    expect(all.map(([name]) => name).sort()).toEqual(
      [
        'Bike',
        'Car',
        'ChevronLeft',
        'Copy',
        'Crosshair',
        'Ellipsis',
        'Flag',
        'Footprints',
        'GripVertical',
        'Languages',
        'ListOrdered',
        'LocateFixed',
        'MapPin',
        'MapPinPlus',
        'Moon',
        'Navigation',
        'Plus',
        'Route',
        'Search',
        'Share2',
        'Shell',
        'Star',
        'Sun',
        'Trash',
        'Undo2',
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
