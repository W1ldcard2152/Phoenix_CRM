import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import AuthService from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';

// Lands from a one-time password link — emailed, handed over by an admin, or
// issued by the operator. Sets the password and signs the user straight in.
const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await AuthService.resetPassword(token, { password, passwordConfirm });
      updateUser(res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Try again in a minute.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-parchment py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <img src="/cvLogo.png" alt="CV Repair" className="mx-auto h-32 w-32 rounded-2xl shadow-md" />
          <p className="mt-4 text-center text-sm text-gray-600">Choose a new password</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
            )}
            <Input
              label="New Password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Input
              label="Confirm New Password"
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">At least 8 characters.</p>
            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save password and sign in'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-800">Need a new link?</Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
