import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils/render';
import { PasswordField } from '../password-field/password-field';
import { TextArea } from '../text-area/text-area';
import { TextField } from '../text-field/text-field';

describe('TextField', () => {
  it('is_labelled_by_its_label_and_described_by_its_hint', () => {
    renderWithIntl(<TextField label="Title" hint="1 to 120 characters" />);

    const input = screen.getByRole('textbox', { name: 'Title' });

    expect(input).toHaveAccessibleDescription('1 to 120 characters');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks_the_input_invalid_and_alerts_the_error', () => {
    renderWithIntl(<TextField label="Title" hint="1 to 120 characters" error="Enter a title" />);

    const input = screen.getByRole('textbox', { name: 'Title' });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('1 to 120 characters Enter a title');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a title');
  });

  it('describes_the_input_by_the_error_alone_when_there_is_no_hint', () => {
    renderWithIntl(<TextField label="E-mail" type="email" error="This e-mail is taken" />);

    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveAccessibleDescription(
      'This e-mail is taken',
    );
  });

  it('clears_the_invalid_state_when_the_error_goes_away', () => {
    const { rerender } = renderWithIntl(<TextField label="Title" error="Enter a title" />);

    rerender(<TextField label="Title" />);

    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('passes_input_props_through', async () => {
    const { user } = renderWithIntl(<TextField label="Title" name="title" defaultValue="Lis" />);
    const input = screen.getByRole('textbox', { name: 'Title' });

    await user.type(input, 'boa');

    expect(input).toHaveAttribute('name', 'title');
    expect(input).toHaveValue('Lisboa');
  });
});

describe('TextArea', () => {
  it('wires_its_error_like_a_text_field', () => {
    renderWithIntl(<TextArea label="Your review" error="At least 10 characters" />);

    const textArea = screen.getByRole('textbox', { name: 'Your review' });

    expect(textArea).toHaveAttribute('aria-invalid', 'true');
    expect(textArea).toHaveAccessibleDescription('At least 10 characters');
  });
});

describe('PasswordField', () => {
  it('hides_the_password_until_the_viewer_asks_to_show_it', async () => {
    const { user, container } = renderWithIntl(
      <PasswordField label="Password" autoComplete="new-password" hint="At least 12 characters" />,
    );
    const input = container.querySelector('input');

    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAccessibleName('Password');
    expect(input).toHaveAccessibleDescription('At least 12 characters');
    expect(input).toHaveAttribute('autocomplete', 'new-password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByRole('textbox', { name: 'Password' })).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('accepts_a_pasted_password', async () => {
    const { user, container } = renderWithIntl(
      <PasswordField label="Password" autoComplete="current-password" />,
    );
    const input = container.querySelector('input');
    if (input === null) {
      throw new Error('no input');
    }

    await user.click(input);
    await user.paste('correct horse battery');

    expect(input).toHaveValue('correct horse battery');
  });

  it('marks_the_input_invalid_and_alerts_the_error', () => {
    const { container } = renderWithIntl(
      <PasswordField label="Password" autoComplete="new-password" error="Too short" />,
    );

    expect(container.querySelector('input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Too short');
  });

  it('labels_the_toggle_in_portuguese', () => {
    renderWithIntl(<PasswordField label="Senha" autoComplete="new-password" />, {
      locale: 'pt-BR',
    });

    expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveTextContent('Mostrar');
  });
});
