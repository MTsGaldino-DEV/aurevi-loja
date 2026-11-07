import { PasswordForm } from '@/components/admin/password-form';

export const metadata = { title: 'Alterar senha' };

export default function PasswordPage() {
  return (
    <div className="max-w-sm">
      <h1 className="font-serif text-4xl">Alterar senha</h1>
      <PasswordForm />
    </div>
  );
}
