import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import AuthService from '../../services/authService';

// Signed-out password recovery. A shop that can send email gets the usual
// "email me a link" form. A shop that can't is told who can help instead —
// an admin can issue the same one-time link from Administration.
const ForgotPassword = () => {
  const [method, setMethod] = useState(null); // 'email' | 'admin' | null while loading
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    AuthService.getPasswordResetMethod()
      .then(setMethod)
      .catch(() => setMethod('admin'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await AuthService.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Try again in a minute.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-parchment py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <img src="/cvLogo.png" alt="CV Repair" className="mx-auto h-32 w-32 rounded-2xl shadow-md" />
          <p className="mt-4 text-center text-sm text-gray-600">Forgot your password?</p>
        </div>

        <Card>
          {method === null && <p className="text-sm text-gray-500 text-center">Loading…</p>}

          {method === 'admin' && (
            <div className="space-y-3 text-sm text-gray-700">
              <p>Ask your shop's administrator for a password link.</p>
              <p className="text-gray-500">
                They can make one in <strong>Administration</strong> — it's the <strong>Password link</strong> button
                next to your name. Opening the link lets you choose a new password.
              </p>
            </div>
          )}

          {method === 'email' && sent && (
            <div className="space-y-3 text-sm text-gray-700">
              <p>If there's an account for <strong>{email.trim()}</strong>, a link to choose a new password is on its way.</p>
              <p className="text-gray-500">It works once, for 10 minutes. Check your spam folder if it hasn't arrived.</p>
            </div>
          )}

          {method === 'email' && !sent && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <p className="text-sm text-gray-600">Enter your email and we'll send you a link to choose a new password.</p>
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
              )}
              <Input
                label="Email Address"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" variant="primary" className="w-full" disabled={submitting || !email.trim()}>
                {submitting ? 'Sending…' : 'Email me a link'}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-primary-600 hover:text-primary-800">Back to sign in</Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
