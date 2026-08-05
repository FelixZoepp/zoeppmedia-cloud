'use client';

export function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-gray-500 hover:text-gray-700 text-sm"
    >
      Abmelden
    </button>
  );
}
