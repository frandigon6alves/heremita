import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './account-menu';
import { renderAuth } from './test-support';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe('AccountMenu', () => {
  it('shows_the_display_name_on_a_button_that_opens_the_menu_popover', () => {
    renderAuth(<AccountMenu displayName="Ana Beatriz" />);

    const trigger = screen.getByRole('button', { name: 'Account: Ana Beatriz' });
    expect(trigger).toHaveTextContent('Ana Beatriz');
    const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
    expect(popover).toHaveAttribute('popover', 'auto');
  });

  it('offers_settings_and_log_out_in_the_menu', () => {
    renderAuth(<AccountMenu displayName="Ana" />, { locale: 'pt-BR' });

    const trigger = screen.getByRole('button', { name: 'Conta: Ana' });
    const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
    if (popover === null) {
      throw new Error('popover missing');
    }
    const menu = within(popover);
    expect(menu.getByRole('link', { name: 'Configurações', hidden: true })).toHaveAttribute(
      'href',
      '/pt-BR/settings',
    );
    expect(menu.getByRole('button', { name: 'Sair', hidden: true })).toBeInTheDocument();
  });

  it('links_moderators_to_the_moderation_queue', () => {
    renderAuth(<AccountMenu displayName="Ana" moderator />);

    const trigger = screen.getByRole('button', { name: 'Account: Ana' });
    const popover = document.getElementById(trigger.getAttribute('popovertarget') ?? '');
    if (popover === null) {
      throw new Error('popover missing');
    }
    expect(within(popover).getByRole('link', { name: 'Moderation', hidden: true })).toHaveAttribute(
      'href',
      '/en/moderation',
    );
  });

  it('hides_moderation_from_other_users', () => {
    renderAuth(<AccountMenu displayName="Ana" />);

    expect(screen.queryByRole('link', { name: 'Moderation', hidden: true })).toBeNull();
  });
});
